import * as z from 'zod';

/** CMS'te telefon alanı en fazla 20 karakter (event-registrations, member-applications). */
export const PHONE_MAX = 20;

/** Başvuru formlarındaki telefon: 10–20 karakter, yalnız rakam, boşluk, +, ( ) ve -. */
export const phoneSchema = (tooShort: string) =>
  z
    .string()
    .trim()
    .min(10, tooShort)
    .max(PHONE_MAX, `Telefon numarası en fazla ${PHONE_MAX} karakter olabilir`)
    .regex(/^[0-9+()\s-]+$/, 'Telefon numarasında yalnız rakam, boşluk, +, ( ) ve - olabilir');

/** Telefon kutusu: sınırın ötesine yazdırmaz, telefonda rakam klavyesi açar. */
export const phoneInputProps = { type: 'tel', inputMode: 'tel', autoComplete: 'tel', maxLength: PHONE_MAX } as const;
