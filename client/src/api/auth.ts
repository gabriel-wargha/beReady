import type { LoginBody, SignupBody, UpdateMeBody, User } from '@beready/shared';
import { api } from './client';

export const getMe = () => api<User>('GET', '/me');
export const signup = (body: SignupBody) => api<User>('POST', '/auth/signup', body);
export const login = (body: LoginBody) => api<User>('POST', '/auth/login', body);
export const logout = () => api<void>('POST', '/auth/logout');
export const updateMe = (body: UpdateMeBody) => api<User>('PATCH', '/me', body);
