#!/usr/bin/env python3
"""
Migração segura: cria tabelas parasite_control_records e grooming_records
e migra os dados do blob health_data. Idempotente — pode rodar N vezes.

Uso: .venv/bin/python -m src.pets.migrate_to_proper_tables
"""
import json
import sys
import os
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from sqlalchemy import text
from ..db import Base, engine, SessionLocal
# Registrar TODOS os modelos (resolve forward-refs de relacionamentos)
from . import models as _pets_models               # noqa: F401
from .vaccine_models import VaccineRecord as _v    # noqa: F401
from .document_models import PetDocument as _pd    # noqa: F401
from ..health import models as _health_models      # noqa: F401 (FeedingPlan)
from .parasite_models import ParasiteControlRecord
from .grooming_models import GroomingRecord


def parse_dt(val):
    """Converte string de data para datetime — aceita vários formatos."""
    if not val:
        return None
    try:
        v = str(val).strip()[:19]
        for fmt in ('%Y-%m-%d %H:%M:%S', '%Y-%m-%dT%H:%M:%S', '%Y-%m-%d'):
            try:
                return datetime.strptime(v, fmt)
            except ValueError:
                continue
    except Exception:
        pass
    return None


def safe_float(val):
    try:
        f = float(val)
        return f if f != 0.0 else None
    except (TypeError, ValueError):
        return None


def run():
    print("=== PETMOL — Migração parasite_controls + grooming_records ===\n")

    # 1. Criar tabelas (idempotente)
    print("[1/2] Criando tabelas (se não existirem)...")
    Base.metadata.create_all(bind=engine, tables=[
        ParasiteControlRecord.__table__,
        GroomingRecord.__table__,
    ])
    print("      ✅ Tabelas prontas.\n")

    # 2. Migrar via raw SQL com ON CONFLICT DO NOTHING
    # Garante que dados existentes não são sobrescritos e IDs duplicados
    # entre pets diferentes (ex.: "para-1") não causam erro de chave.
    db = SessionLocal()
    try:
        pets = db.execute(
            text("SELECT id, name, health_data FROM pets WHERE health_data IS NOT NULL")
        ).fetchall()
        print(f"[2/2] Processando {len(pets)} pets...\n")

        total_parasite = 0
        total_grooming = 0
        skipped_parasite = 0
        skipped_grooming = 0

        for pet_id, pet_name, hd_raw in pets:
            # Normalizar health_data (pode vir como str ou dict)
            if not hd_raw:
                continue
            if isinstance(hd_raw, dict):
                hd = hd_raw
            elif isinstance(hd_raw, str):
                stripped = hd_raw.strip()
                if stripped in ('{}', 'null', ''):
                    continue
                try:
                    hd = json.loads(stripped)
                except json.JSONDecodeError:
                    print(f"  ⚠️  {pet_name}: health_data inválido, pulando")
                    continue
            else:
                continue

            if not isinstance(hd, dict):
                continue

            # ── Parasite controls ──────────────────────────────────────────
            for pc in hd.get('parasite_controls', []):
                original_id = str(pc.get('id', '')).strip()
                if not original_id:
                    continue

                date_applied = parse_dt(pc.get('date_applied'))
                if not date_applied:
                    print(f"  ⚠️  {pet_name} | parasite '{original_id}': date_applied inválido, pulando")
                    continue

                # Verifica se já existe para este pet específico
                already = db.execute(
                    text("SELECT 1 FROM parasite_control_records WHERE id = :id AND pet_id = :pid"),
                    {"id": original_id, "pid": str(pet_id)}
                ).first()
                if already:
                    skipped_parasite += 1
                    continue

                # IDs genéricos como "para-1" podem colidir entre pets diferentes.
                # Se colidir, gera ID derivado: original_id + pet_id[:8]
                collision = db.execute(
                    text("SELECT 1 FROM parasite_control_records WHERE id = :id"),
                    {"id": original_id}
                ).first()
                record_id = original_id if not collision else f"{original_id}_{str(pet_id)[:8]}"

                db.execute(text("""
                    INSERT INTO parasite_control_records
                        (id, pet_id, type, product_name, active_ingredient,
                         date_applied, next_due_date, frequency_days,
                         pet_weight_kg, dosage, application_form,
                         veterinarian, clinic_name, batch_number,
                         cost, purchase_location, collar_expiry_date,
                         reminder_enabled, reminder_days, alert_days_before,
                         notes, deleted, created_at, updated_at)
                    VALUES
                        (:id, :pet_id, :type, :product_name, :active_ingredient,
                         :date_applied, :next_due_date, :frequency_days,
                         :pet_weight_kg, :dosage, :application_form,
                         :veterinarian, :clinic_name, :batch_number,
                         :cost, :purchase_location, :collar_expiry_date,
                         :reminder_enabled, :reminder_days, :alert_days_before,
                         :notes, false, NOW(), NOW())
                    ON CONFLICT (id) DO NOTHING
                """), {
                    "id": record_id,
                    "pet_id": str(pet_id),
                    "type": str(pc.get('type', 'flea_tick'))[:40],
                    "product_name": str(pc.get('product_name', 'Desconhecido'))[:200],
                    "active_ingredient": pc.get('active_ingredient'),
                    "date_applied": date_applied,
                    "next_due_date": parse_dt(pc.get('next_due_date')),
                    "frequency_days": int(pc.get('frequency_days') or 30),
                    "pet_weight_kg": pc.get('pet_weight_kg'),
                    "dosage": pc.get('dosage') or None,
                    "application_form": pc.get('application_form'),
                    "veterinarian": pc.get('veterinarian') or None,
                    "clinic_name": pc.get('clinic_name') or None,
                    "batch_number": pc.get('batch_number') or None,
                    "cost": safe_float(pc.get('cost')),
                    "purchase_location": pc.get('purchase_location') or None,
                    "collar_expiry_date": parse_dt(pc.get('collar_expiry_date')),
                    "reminder_enabled": bool(pc.get('reminder_enabled', True)),
                    "reminder_days": int(pc.get('reminder_days') or pc.get('alert_days_before') or 7),
                    "alert_days_before": pc.get('alert_days_before'),
                    "notes": pc.get('notes') or None,
                })
                total_parasite += 1

            # ── Grooming records ───────────────────────────────────────────
            for gr in hd.get('grooming_records', []):
                original_id = str(gr.get('id', '')).strip()
                if not original_id:
                    continue

                date_val = parse_dt(gr.get('date'))
                if not date_val:
                    print(f"  ⚠️  {pet_name} | grooming '{original_id}': date inválido, pulando")
                    continue

                already = db.execute(
                    text("SELECT 1 FROM grooming_records WHERE id = :id AND pet_id = :pid"),
                    {"id": original_id, "pid": str(pet_id)}
                ).first()
                if already:
                    skipped_grooming += 1
                    continue

                collision = db.execute(
                    text("SELECT 1 FROM grooming_records WHERE id = :id"),
                    {"id": original_id}
                ).first()
                record_id = original_id if not collision else f"{original_id}_{str(pet_id)[:8]}"

                reschedule = gr.get('reschedule_history')
                if isinstance(reschedule, list):
                    reschedule = json.dumps(reschedule, ensure_ascii=False)
                elif not isinstance(reschedule, str):
                    reschedule = None

                db.execute(text("""
                    INSERT INTO grooming_records
                        (id, pet_id, type, date, scheduled_time,
                         location, location_address, location_phone, location_place_id,
                         groomer, cost, notes,
                         next_recommended_date, frequency_days, original_frequency_days,
                         last_completed_date, reminder_enabled, alert_days_before,
                         reminder_days_before, rescheduled_count, reschedule_history,
                         deleted, created_at, updated_at)
                    VALUES
                        (:id, :pet_id, :type, :date, :scheduled_time,
                         :location, :location_address, :location_phone, :location_place_id,
                         :groomer, :cost, :notes,
                         :next_recommended_date, :frequency_days, :original_frequency_days,
                         :last_completed_date, :reminder_enabled, :alert_days_before,
                         :reminder_days_before, :rescheduled_count, :reschedule_history,
                         false, NOW(), NOW())
                    ON CONFLICT (id) DO NOTHING
                """), {
                    "id": record_id,
                    "pet_id": str(pet_id),
                    "type": str(gr.get('type', 'bath_grooming'))[:20],
                    "date": date_val,
                    "scheduled_time": gr.get('scheduled_time'),
                    "location": gr.get('location'),
                    "location_address": gr.get('location_address'),
                    "location_phone": gr.get('location_phone'),
                    "location_place_id": gr.get('location_place_id'),
                    "groomer": gr.get('groomer'),
                    "cost": safe_float(gr.get('cost')),
                    "notes": gr.get('notes') or None,
                    "next_recommended_date": parse_dt(gr.get('next_recommended_date')),
                    "frequency_days": gr.get('frequency_days'),
                    "original_frequency_days": gr.get('original_frequency_days'),
                    "last_completed_date": parse_dt(gr.get('last_completed_date')),
                    "reminder_enabled": bool(gr.get('reminder_enabled', False)),
                    "alert_days_before": gr.get('alert_days_before'),
                    "reminder_days_before": gr.get('reminder_days_before'),
                    "rescheduled_count": int(gr.get('rescheduled_count') or 0),
                    "reschedule_history": reschedule,
                })
                total_grooming += 1

        db.commit()

        # Contagem final verificada no banco
        pc_total = db.execute(text("SELECT COUNT(*) FROM parasite_control_records WHERE deleted = false")).scalar()
        gr_total = db.execute(text("SELECT COUNT(*) FROM grooming_records WHERE deleted = false")).scalar()

        print(f"  ✅ Parasite: {total_parasite} novos inseridos, {skipped_parasite} já existiam")
        print(f"  ✅ Grooming: {total_grooming} novos inseridos, {skipped_grooming} já existiam")
        print(f"\n  📊 Total no banco agora: {pc_total} parasite | {gr_total} grooming")
        print("\n=== Migração concluída — nenhum dado perdido ===")

    except Exception as e:
        db.rollback()
        print(f"\n❌ ERRO: {e}")
        import traceback; traceback.print_exc()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    run()
