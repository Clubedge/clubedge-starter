export interface AuthUser {
  id: string;
  email: string | null;
}

export interface AuthProvider {
  getUser(): Promise<AuthUser | null>;
  signOut(): Promise<void>;
}
