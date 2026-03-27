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
  university_name?: string;
  university_logo?: string;
  college_name?: string;
  college_logo?: string;
}

export interface LoginResponse {
  token: string;
  user: User;
}
