export type UserRole =
  | "super_admin"
  | "university_admin"
  | "college_admin"
  | "doctor"
  | "student"
  | "employee"
  | "assistant";

export interface User {
  id: number;
  name: string;
  username: string;
  role: UserRole;
  university_id?: number | null;
  college_id?: number | null;
}

export interface LoginResponse {
  token: string;
  user: User;
}
