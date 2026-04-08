'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getToken } from '@/lib/auth-token';
import { API_BASE_URL } from '@/lib/api';
import { PetPhotoPicker } from '@/components/PetPhotoPicker';
import { localTodayISO } from '@/lib/localDate';

const G   = 'divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-200';
const ROW = 'bg-white px-4 py-3';
const CTA = 'w-full py-3.5 bg-[#0056D2] text-white text-sm font-semibold rounded-xl active:scale-[0.98] transition-transform disabled:opacity-40 disabled:cursor-not-allowed';

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
    <div className="flex h-9 rounded-xl bg-gray-100 p-0.5 gap-0.5">
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
    <div className="min-h-dvh bg-gray-50 flex flex-col items-center px-4 py-8">
      <div className="w-full max-w-sm space-y-4 pb-10">

        {/* Header */}
        <div className="text-center pt-2 pb-1">
          <p className="text-xl font-bold tracking-tight text-gray-900">Apresente seu pet</p>
          <p className="text-sm text-gray-500 mt-0.5">Último passo — quase lá</p>
        </div>

        {/* Photo + name */}
        <div className={G}>
          <div className={`${ROW} flex items-center gap-4`}>
            <button type="button" onClick={() => setShowPhotoPicker(true)}
              className="w-14 h-14 rounded-xl overflow-hidden bg-gray-100 border border-gray-200 flex-shrink-0 flex items-center justify-center">
              {petPhoto ? (
                <img src={petPhoto} alt="Pet" className="w-full h-full object-cover" />
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none"
                  stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M14.5 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.5 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.5a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 9.5 4z" />
                  <circle cx="12" cy="13" r="3" />
                </svg>
              )}
            </button>
            <div className="flex-1 min-w-0">
              <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                placeholder="Nome do pet"
                className="w-full text-sm bg-transparent outline-none placeholder:text-gray-400 text-gray-900" />
              <p className="text-xs text-gray-400 mt-0.5">Foto opcional — toque para adicionar</p>
            </div>
          </div>
        </div>

        {/* Species + sex */}
        <div className={G}>
          <div className={`${ROW} space-y-2`}>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Tipo de animal</p>
            <Seg
              opts={[{ l: 'Cão', v: 'dog' }, { l: 'Gato', v: 'cat' }, { l: 'Outro', v: 'other' }]}
              val={speciesSeg}
              onChange={(v) => { setSpecies(v); setBreed(''); }}
            />
          </div>
          <div className={`${ROW} space-y-2`}>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Sexo</p>
            <div className="grid grid-cols-2 gap-2">
              {(['male', 'female'] as const).map((v) => (
                <button key={v} type="button" onClick={() => setSex(sex === v ? '' : v)}
                  className={`py-2.5 rounded-xl border text-sm font-semibold transition-all ${
                    sex === v ? 'border-[#0056D2] bg-blue-50 text-[#0047ad]' : 'border-gray-200 bg-white text-gray-600'
                  }`}>
                  {v === 'male' ? 'Macho' : 'Fêmea'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Detalhes extras */}
        <div className={G}>
          <button type="button" onClick={() => setExtrasOpen((v) => !v)}
            className={`${ROW} flex w-full items-center justify-between`}>
            <span className="text-sm font-medium text-gray-800">Detalhes extras</span>
            <span className={`text-gray-400 text-xs transition-transform ${extrasOpen ? 'rotate-180' : ''}`}>▾</span>
          </button>

          {extrasOpen && (
            <>
              <div className={ROW}>
                <label className="block text-xs text-gray-500 mb-1.5">Raça</label>
                <select value={breed} onChange={(e) => setBreed(e.target.value)}
                  className="w-full bg-transparent text-sm outline-none text-gray-700">
                  <option value="">Selecionar raça</option>
                  {breedOptions.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div className={ROW}>
                <label className="block text-xs text-gray-500 mb-1.5">Data de nascimento</label>
                <input type="date" max={today} value={birthDate} onChange={(e) => setBirthDate(e.target.value)}
                  className="w-full bg-transparent text-sm outline-none text-gray-700" />
              </div>
              <div className={`${ROW} flex items-center gap-3`}>
                <span className="text-sm text-gray-800 flex-1">Peso</span>
                <input type="text" inputMode="decimal" value={weightValue}
                  onChange={(e) => setWeightValue(e.target.value)} placeholder="0.0"
                  className="w-16 text-right text-sm bg-transparent outline-none text-gray-700 placeholder:text-gray-400" />
                <select value={weightUnit} onChange={(e) => setWeightUnit(e.target.value)}
                  className="text-sm bg-transparent outline-none text-gray-500">
                  <option value="kg">kg</option>
                  <option value="lb">lb</option>
                </select>
              </div>
              <div className={`${ROW} flex items-center justify-between`}>
                <span className="text-sm text-gray-800">Castrado / Esterilizado</span>
                <Switch on={neutered} onChange={() => setNeutered((v) => !v)} />
              </div>
            </>
          )}
        </div>

        {error && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        <button type="button" onClick={handleSubmit} disabled={loading || !canSubmit} className={CTA}>
          {loading ? 'Salvando...' : 'Entrar no app'}
        </button>
      </div>

      {showPhotoPicker && (
        <PetPhotoPicker initialSrc={petPhoto || null} onConfirm={handlePhotoPickerConfirm} onCancel={() => setShowPhotoPicker(false)} />
      )}
    </div>
  );
}
