export function stagingBannerEnabled(env: object): boolean {
  return 'BYT_STAGING' in env && env.BYT_STAGING === '1'
}
