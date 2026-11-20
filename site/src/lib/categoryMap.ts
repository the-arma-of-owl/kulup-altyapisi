import { BookOpen, MapPin, Code, Shield, Users, ExternalLink, Calendar, GraduationCap, Navigation } from 'lucide-react';

export const CATEGORY_MAP: Record<string, any> = {
  kampus: { label: 'Kampüs', icon: MapPin, color: 'text-cyan-500', bg: 'bg-cyan-500/10', border: 'border-cyan-500/30' },
  konum: { label: 'Konum', icon: Navigation, color: 'text-sky-500', bg: 'bg-sky-500/10', border: 'border-sky-500/30' },
  ders: { label: 'Ders & Sınav', icon: GraduationCap, color: 'text-blue-500', bg: 'bg-blue-500/10', border: 'border-blue-500/30' },
  yazilim: { label: 'Yazılım', icon: Code, color: 'text-indigo-500', bg: 'bg-indigo-500/10', border: 'border-indigo-500/30' },
  kulup: { label: 'Kulüp & Etkinlik', icon: Users, color: 'text-violet-500', bg: 'bg-violet-500/10', border: 'border-violet-500/30' },
  kaynak: { label: 'Kaynak & Tavsiye', icon: BookOpen, color: 'text-slate-500', bg: 'bg-slate-500/10', border: 'border-slate-500/30' },
};
