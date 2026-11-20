export default function StagingBanner() {
  if (process.env.NEXT_PUBLIC_BYT_STAGING !== '1') return null;
  return <div className="sticky top-0 z-50 bg-yellow-400 px-4 py-2 text-center font-bold text-black">STAGING · test ortamı</div>;
}
