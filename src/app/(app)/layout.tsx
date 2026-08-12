import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Sidebar } from "@/components/shell/sidebar";

// 登入後的共用外框(對應 prototype 的 .shell)。
// 所有需要登入的頁面都放在這個 route group 底下。
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const balance = await prisma.creditBalance.findUnique({
    where: { userId: user.id },
    select: { balance: true },
  });

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar email={user.email} credits={balance?.balance ?? 0} />
      <main className="flex-1 overflow-y-auto bg-canvas">{children}</main>
    </div>
  );
}
