import { redirect } from 'next/navigation';
import { authenticated } from '../../lib/auth';
export default async function DashboardIndex() {
  const user = await authenticated();
  redirect(user ? `/dashboard/${user.login}` : '/streamers');
}
