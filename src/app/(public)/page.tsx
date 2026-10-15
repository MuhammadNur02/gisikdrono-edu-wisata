import { siteConfig } from '@/config/site';

export default function HomePage() {
  return (
    <main>
      <h1>{siteConfig.name}</h1>
      <p>Situs ini sedang kami siapkan. Sampai jumpa sebentar lagi!</p>
    </main>
  );
}
