// Sayfalardaki notFound() çağrıları için (olmayan blog yazısı, etkinlik vb.).
// Eşleşmeyen adresler ise app/global-not-found.tsx ile sunucuda render edilir.
// Not: Kök layout [locale] segmentinde olduğu için Next bu boundary'yi sunucuda değil
// tarayıcıda render ediyor; ilk HTML Next'in yedek 404'ü olur, hydration sonrası bu sayfa görünür.
export { default } from '@/components/NotFoundContent';
