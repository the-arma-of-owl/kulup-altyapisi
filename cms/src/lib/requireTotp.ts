import type { Access, CollectionConfig, GlobalConfig } from 'payload'

type TotpUser = { hasTotp?: boolean; _strategy?: string } | null

/** Preserve anonymous access rules; require a verified second factor for every signed-in user. */
export const requireTotp = (inner?: Access): Access => (args) => {
  const user = args.req.user as TotpUser
  if (user && !hasVerifiedTotp(user)) return false
  return inner ? inner(args) : Boolean(user)
}

export const withTotpAccess = (config: CollectionConfig): CollectionConfig => ({
  ...config,
  access: {
    ...config.access,
    create: requireTotp(config.access?.create),
    read: requireTotp(config.access?.read),
    update: requireTotp(config.access?.update),
    delete: requireTotp(config.access?.delete),
    readVersions: requireTotp(config.access?.readVersions),
    unlock: requireTotp(config.access?.unlock),
  },
})

export const withTotpGlobalAccess = (config: GlobalConfig): GlobalConfig => ({
  ...config,
  access: {
    ...config.access,
    read: requireTotp(config.access?.read),
    update: requireTotp(config.access?.update),
    readVersions: requireTotp(config.access?.readVersions),
  },
})

// Katılımcı (participants) oturumunda hasTotp yoktur → her zaman false (geniş tip: User | Participant).
export const hasVerifiedTotp = (user: object | null | undefined): boolean =>
  Boolean((user as TotpUser)?.hasTotp && (user as TotpUser)?._strategy === 'totp')
