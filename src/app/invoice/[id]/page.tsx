import InvoiceClient from './client';

export async function generateStaticParams() {
  return [{ id: 'index' }];
}

export default function InvoicePage() {
  return <InvoiceClient />;
}