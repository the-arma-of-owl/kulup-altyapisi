import { getMediaUrl } from '@/lib/api';
import type { RegistrationField } from '@/app/[locale]/etkinlikler/[slug]/EventRegistrationForm';

type CmsRegistrationField = Omit<RegistrationField, 'imageUrl' | 'choices'> & {
  image?: unknown;
  choices?: { label?: string; image?: unknown }[];
};

// Etkinliğin kayıt soruları forma gidecek biçimde. Resimli test sorularında görsel adresi sunucuda
// çözülür; forma yalnızca URL gider.
export function registrationFieldsOf(event: { registrationFields?: unknown }): RegistrationField[] {
  const fields = (Array.isArray(event.registrationFields) ? event.registrationFields : []) as CmsRegistrationField[];
  return fields.map((field) => ({
    id: field.id,
    name: field.name,
    type: field.type,
    required: field.required,
    options: field.options,
    imageUrl: field.type === 'quiz' && field.image ? getMediaUrl(field.image) || undefined : undefined,
    choices: field.type === 'quiz' && Array.isArray(field.choices)
      ? field.choices.map((choice) => ({ label: choice.label || '', imageUrl: getMediaUrl(choice.image) || '' })).filter((choice) => choice.imageUrl)
      : undefined,
  }));
}
