import { sb, Project, Task, Company, Contact, Deal, AppUser, Risk, Financial } from './supabase';

export async function signIn(username: string, password: string): Promise<AppUser | null> {
  const { data, error } = await sb.rpc('login', { p_username: username, p_password: password });
  if (error) throw new Error(error.message);
  return (data as AppUser) ?? null;
}

export async function getProjects(): Promise<Project[]> {
  const { data, error } = await sb.from('projects').select('*').order('created_at', { ascending: false });
  if (error) throw error; return data || [];
}

export async function getTasks(): Promise<Task[]> {
  const { data, error } = await sb.from('tasks').select('*, projects(name)').order('due_date', { ascending: true });
  if (error) throw error; return (data as Task[]) || [];
}

export async function getCompanies(): Promise<Company[]> {
  const { data, error } = await sb.from('crm_companies').select('*').order('name');
  if (error) throw error; return data || [];
}

export async function getContacts(): Promise<Contact[]> {
  const { data, error } = await sb.from('crm_contacts').select('*, crm_companies(name)').order('full_name');
  if (error) throw error; return (data as Contact[]) || [];
}

export async function getDeals(): Promise<Deal[]> {
  const { data, error } = await sb.from('crm_deals')
    .select('*, crm_companies(name), crm_contacts(full_name, email)')
    .order('value', { ascending: false });
  if (error) throw error; return (data as Deal[]) || [];
}

export async function getRisks(): Promise<Risk[]> {
  const { data, error } = await sb.from('risks')
    .select('*, projects(name)')
    .order('impact', { ascending: false });
  if (error) throw error; return (data as Risk[]) || [];
}

export async function getFinancials(): Promise<Financial[]> {
  const { data, error } = await sb.from('financials')
    .select('*, projects(name)')
    .order('period', { ascending: true });
  if (error) throw error; return (data as Financial[]) || [];
}
