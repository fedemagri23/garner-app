export interface TokenPair {
  accessToken: string;
  /** Seconds the access token stays valid, so a client can refresh ahead of it. */
  accessTokenExpiresIn: number;
  refreshToken: string;
}
