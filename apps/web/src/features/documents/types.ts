export interface PetDocument {
  id: string;
  pet_id: string;
  kind: 'file' | 'link';
  category: string | null;
  title: string | null;
  document_date: string | null;
  establishment_name: string | null;
  notes: string | null;
  source: string;
  url_masked: string | null;
  storage_key: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
  icon: string;
}

export interface BatchDocItem {
  id: string;
  title: string;
  category: string;
  icon: string;
  mime_type: string | null;
  customTitle: string;
  customCategory: string;
}

export interface BatchConfirm {
  docs: BatchDocItem[];
  detectedDate: string | null;
  detectedEstablishment: string | null;
  sharedDate: string;
  sharedEstablishment: string;
  saving: boolean;
}

export interface DiscoveredItem {
  url: string;
  url_masked: string;
  title: string;
}

export interface EditingDoc {
  id: string;
  title: string;
  category: string;
  date: string;
  establishment: string;
  saving: boolean;
}

export interface PetDocumentVaultProps {
  petId: string;
  onDocsChanged?: () => void;
}