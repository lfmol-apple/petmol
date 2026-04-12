'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getToken } from '@/lib/auth-token';
import { API_BASE_URL } from '@/lib/api';
import { PetPhotoPicker } from '@/components/PetPhotoPicker';
import { localTodayISO } from '@/lib/localDate';

import { BrandBackground, PetmolTextLogo } from '@/components/ui/BrandBackground';

const G   = 'divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-100 bg-white/50 backdrop-blur-sm shadow-sm';
const ROW = 'px-4 py-4';
const CTA = 'w-full py-4 bg-gradient-to-r from-[#0066ff] to-[#0056D2] text-white text-base font-bold rounded-2xl active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-blue-500/10';

function Switch({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <button type="button" onClick={onChange} role="switch" aria-checked={on}
      className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${on ? 'bg-blue-500' : 'bg-gray-200'}`}>
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${on ? 'translate-x-5' : ''}`} />
    </button>
  );
}

function Seg({ opts, val, onChange }: { opts: { l: string; v: string }[]; val: string; onChange: (v: string) => void }) {
  return (
    <div className="flex h-9 rounded-xl bg-gray-100 p-0.5 gap-0.5 w-full">
      {opts.map((o) => (
        <button key={o.v} type="button" onClick={() => onChange(o.v)}
          className={`flex-1 rounded-[0.6rem] text-xs font-semibold transition-all ${val === o.v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
          {o.l}
        </button>
      ))}
    </div>
  );
}

const DOG_BREEDS = [
  'SRD (Sem Raça Definida)','Affenpinscher','Afghan Hound (Galgo Afegão)','Airedale Terrier',
  'Akita Americano','Akita Japonês','Malamute do Alasca','American Bully','American Pit Bull Terrier',
  'American Staffordshire Terrier','Pastor Australiano','Basenji','Basset Hound','Beagle',
  'Bernese Mountain Dog','Bichon Frisé','Bloodhound','Border Collie','Border Terrier',
  'Boston Terrier','Boxer','Braco Alemão','Bull Terrier','Bulldog Americano','Bulldog Francês',
  'Bulldog Inglês','Bullmastiff','Cairn Terrier','Cane Corso','Cavalier King Charles Spaniel',
  'Chihuahua','Chow Chow','Cocker Spaniel Americano','Cocker Spaniel Inglês','Collie',
  'Corgi Cardigan','Corgi Pembroke','Dachshund (Salsicha)','Dálmata','Doberman Pinscher',
  'Dogue Alemão','Dogue de Bordeaux','Dogo Argentino','Fila Brasileiro','Fox Terrier',
  'Golden Retriever','Greyhound','Husky Siberiano','Jack Russell Terrier','Labrador Retriever',
  'Lhasa Apso','Maltês','Mastiff Inglês','Miniature Pinscher','Old English Sheepdog','Papillón',
  'Pastor Alemão','Pastor Belga Malinois','Pekingese','Pointer','Pomerânia (Spitz Anão)',
  'Poodle Gigante','Poodle Médio','Poodle Miniatura','Poodle Toy','Pug','Rottweiler','Samoyed',
  'Schnauzer Gigante','Schnauzer Médio','Schnauzer Miniatura','Shar-Pei','Shiba Inu','Shih Tzu',
  'St. Bernard','Staffordshire Bull Terrier','Vizsla','Weimaraner','West Highland White Terrier',
  'Whippet','Yorkshire Terrier','Outro',
];

const CAT_BREEDS = [
  'SRD (Sem Raça Definida)','Abissínio','American Shorthair','Bengal','Birmanês','British Shorthair',
  'Devon Rex','Exótico','Maine Coon','Munchkin','Persa','Ragdoll','Siamês','Sphynx','Outro',
];

export default function RegisterPetPage() {
  const router = useRouter();

  const [name,           setName]           = useState('');
  const [species,        setSpecies]        = useState('dog');
  const [breed,          setBreed]          = useState('');
  const [birthDate,      setBirthDate]      = useState('');
  const [weightValue,    setWeightValue]    = useState('');
  const [weightUnit,     setWeightUnit]     = useState('kg');
  const [sex,            setSex]            = useState('');
  const [neutered,       setNeutered]       = useState(false);
  const [petPhoto,       setPetPhoto]       = useState('');
  const [petPhotoDataUrl,setPetPhotoDataUrl]= useState<string | null>(null);
  const [showPhotoPicker,setShowPhotoPicker]= useState(false);
  const [extrasOpen,     setExtrasOpen]     = useState(false);
  const [loading,        setLoading]        = useState(false);
  const [error,          setError]          = useState('');

  useEffect(() => {
    const token = getToken();
    if (!token) router.push('/login');
  }, [router]);

  const speciesSeg = ['dog', 'cat'].includes(species) ? species : 'other';
  const breedOptions = species === 'dog' ? DOG_BREEDS : species === 'cat' ? CAT_BREEDS : ['SRD (Sem Raça Definida)', 'Outro'];
  const today = localTodayISO();
  const canSubmit = name.trim().length > 0;

  const handlePhotoPickerConfirm = useCallback((dataUrl: string) => {
    setShowPhotoPicker(false);
    setPetPhoto(dataUrl);
    setPetPhotoDataUrl(dataUrl);
  }, []);

  const handleSubmit = async () => {
    setError('');
    if (!name.trim()) { setError('Preencha o nome do pet.'); return; }

    const token = getToken();
    if (!token) { router.push('/login'); return; }

    setLoading(true);
    try {
      const payload = {
        name: name.trim(),
        species,
        breed: breed || undefined,
        birth_date: birthDate || undefined,
        sex: sex || undefined,
        weight_value: weightValue ? parseFloat(weightValue.replace(',', '.')) : undefined,
        weight_unit: weightValue ? weightUnit : undefined,
        neutered,
      };

      const res = await fetch(`${API_BASE_URL}/pets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { detail?: string | Array<{ msg?: string }> };
        const msg = typeof data.detail === 'string'
          ? data.detail
          : Array.isArray(data.detail) ? data.detail.map((i: { msg?: string }) => i.msg ?? 'Erro').join('\n') : `Erro ${res.status}`;
        throw new Error(msg);
      }

      const savedPet = await res.json() as { id: string };

      if (petPhotoDataUrl) {
        try {
          const blob = await (await fetch(petPhotoDataUrl)).blob();
          const fd = new FormData();
          fd.append('file', new File([blob], 'pet-photo.jpg', { type: 'image/jpeg' }));
          await fetch(`${API_BASE_URL}/pets/${savedPet.id}/photo`, {
            method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd,
          });
        } catch { /* non-fatal */ }
      }

      localStorage.setItem('petmol_checkup_v1', JSON.stringify({
        petName: name.trim(),
        vaccines: 'pending', vermifugo: 'pending', antipulgas: 'pending', food: 'pending',
      }));
      router.push('/check-up');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar o pet.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <BrandBackground showLogo={false}>
      <div className="flex flex-col items-center justify-center min-h-[calc(100dvh-40px)] w-full px-4 py-8 animate-fadeIn">
        <div className="w-full max-w-sm flex flex-col items-center mb-10 animate-scaleIn">
          <PetmolTextLogo className="text-6xl drop-shadow-3xl" />
        </div>

        <div className="bg-white/95 backdrop-blur-xl rounded-[40px] shadow-premium border border-white/60 w-full max-w-md p-8 md:p-10 animate-scaleIn overflow-hidden max-h-[85dvh] flex flex-col">
          <div className="mb-6 flex-shrink-0">
            <h2 className="text-2xl font-black text-slate-800 tracking-tight">Apresente seu pet</h2>
            <p className="text-sm text-slate-500 font-medium">Vamos começar cuidando do seu melhor amigo.</p>
          </div>

          <div className="flex-1 overflow-y-auto pr-1 space-y-6">
            {error && (
              <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl text-rose-700 text-sm flex items-center gap-3 animate-shake">
                <span className="text-lg">⚠️</span>
                {error}
              </div>
            )}

            {/* Photo + name */}
            <div className="flex flex-col items-center gap-4 py-2">
              <button type="button" onClick={() => setShowPhotoPicker(true)}
                className="w-24 h-24 rounded-3xl overflow-hidden bg-slate-50 border-2 border-dashed border-slate-200 flex-shrink-0 flex items-center justify-center group hover:border-[#0056D2] hover:bg-white transition-all">
                {petPhoto ? (
                  <img src={petPhoto} alt="Pet" className="w-full h-full object-cover" />
                ) : (
                  <div className="flex flex-col items-center text-slate-400 group-hover:text-blue-600">
                    <span className="text-2xl mb-1">📸</span>
                    <span className="text-[10px] font-bold uppercase tracking-tighter">Foto</span>
                  </div>
                )}
              </button>
              <div className="w-full">
                <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                  placeholder="Nome do seu pet"
                  className="w-full text-center text-xl font-bold bg-transparent outline-none placeholder:text-slate-300 text-slate-800 border-b-2 border-slate-50 focus:border-[#0056D2] transition-colors pb-2" />
              </div>
            </div>

            {/* Species + sex */}
            <div className="space-y-4">
              <div className="space-y-2">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Tipo de animal</p>
                <Seg
                  opts={[{ l: 'Cão', v: 'dog' }, { l: 'Gato', v: 'cat' }, { l: 'Outro', v: 'other' }]}
                  val={speciesSeg}
                  onChange={(v) => { setSpecies(v); setBreed(''); }}
                />
              </div>
              <div className="space-y-2">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Sexo</p>
                <div className="grid grid-cols-2 gap-3">
                  {(['male', 'female'] as const).map((v) => (
                    <button key={v} type="button" onClick={() => setSex(sex === v ? '' : v)}
                      className={`py-3.5 rounded-2xl border-2 text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                        sex === v ? 'border-[#0056D2] bg-blue-50 text-[#0047ad]' : 'border-slate-50 bg-white text-slate-400 hover:border-slate-100'
                      }`}>
                      <span className="text-lg">{v === 'male' ? '♂' : '♀'}</span>
                      {v === 'male' ? 'Macho' : 'Fêmea'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Detalhes extras */}
            <div className={G}>
              <button type="button" onClick={() => setExtrasOpen((v) => !v)}
                className={`${ROW} flex w-full items-center justify-between group`}>
                <span className="text-xs font-bold text-slate-600 uppercase tracking-tighter group-hover:text-blue-600 transition-colors">Detalhes adicionais</span>
                <span className={`text-slate-400 text-xs transition-transform ${extrasOpen ? 'rotate-180 text-blue-600' : ''}`}>▾</span>
              </button>

              {extrasOpen && (
                <div className="px-1 py-1 space-y-1">
                  <div className="bg-white/30 p-4 space-y-4">
                    <div className="space-y-2">
                      <label className="block text-[10px] font-bold text-slate-400 uppercase pl-1">Raça</label>
                      <select value={breed} onChange={(e) => setBreed(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-sm outline-none text-slate-900 focus:bg-white focus:ring-2 focus:ring-[#0056D2]">
                        <option value="">Selecionar raça</option>
                        {breedOptions.map((b) => <option key={b} value={b}>{b}</option>)}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="block text-[10px] font-bold text-slate-400 uppercase pl-1">Nascimento</label>
                      <input type="date" max={today} value={birthDate} onChange={(e) => setBirthDate(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-sm outline-none text-slate-900 focus:bg-white focus:ring-2 focus:ring-[#0056D2]" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="block text-[10px] font-bold text-slate-400 uppercase pl-1">Peso</label>
                        <div className="relative">
                          <input type="text" inputMode="decimal" value={weightValue}
                            onChange={(e) => setWeightValue(e.target.value)} placeholder="0.0"
                            className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-sm outline-none text-slate-900 focus:bg-white focus:ring-2 focus:ring-[#0056D2]" />
                          <select value={weightUnit} onChange={(e) => setWeightUnit(e.target.value)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400 bg-transparent outline-none">
                            <option value="kg">kg</option>
                            <option value="lb">lb</option>
                          </select>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="block text-[10px] font-bold text-slate-400 uppercase pl-1">Castrado?</label>
                        <div className="flex h-[46px] items-center justify-center bg-slate-50 rounded-xl border border-slate-100">
                          <Switch on={neutered} onChange={() => setNeutered((v) => !v)} />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 flex-shrink-0 pt-2 border-t border-slate-100 bg-white/95">
            <button type="button" onClick={handleSubmit} disabled={loading || !canSubmit} className={CTA}>
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Salvando pet...
                </span>
              ) : 'Concluir cadastro'}
            </button>
          </div>
        </div>
      </div>

      {showPhotoPicker && (
        <PetPhotoPicker initialSrc={petPhoto || null} onConfirm={handlePhotoPickerConfirm} onCancel={() => setShowPhotoPicker(false)} />
      )}
    </BrandBackground>
  );
}
