import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnon);

export interface SubmissionData {
  invoiceNumber: string;
  bdMembershipNo: string;
  date: string;
  customerName: string;
  phone: string;
  selectedItems: { book: string; volNums: number[] }[];
}

export interface BookItem {
  name: string;            // English label
  nameKannada: string;     // Kannada label (transliterated for display)
  totalVolumes: number;
  special?: boolean;
}

export const CATALOG: BookItem[] = [
  { name: 'Mahabharata (32 vols)', nameKannada: 'Mahabharata (32 vols)', totalVolumes: 32 },
  { name: 'Srimad Valmiki Ramayana (11 vols)', nameKannada: 'Ramayana (11 vols)', totalVolumes: 11 },
  { name: 'Srimad Bhagavatam (9 vols)', nameKannada: 'Bhagavatam (9 vols)', totalVolumes: 9 },
  { name: 'Harivamsa (6 vols)', nameKannada: 'Harivamsa (6 vols)', totalVolumes: 6 },
  { name: 'Markandeya Purana (4 vols)', nameKannada: 'Markandeya Purana (4 vols)', totalVolumes: 4 },
  { name: 'Vishnu Purana (2 vols)', nameKannada: 'Vishnu Purana (2 vols)', totalVolumes: 2 },
  { name: 'Bharatha Darshana Monthly Magazine (Annual Subscription)', nameKannada: 'Subscription', totalVolumes: 1, special: true },
  { name: 'Special Volumes', nameKannada: 'Special Issues', totalVolumes: 1, special: true },
];
