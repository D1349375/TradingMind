import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

// Supabase Auth 的 auth.users 與我們自己的 User 表是兩套東西。
// 這裡在每次取得登入者時做 upsert,讓兩邊的 id 對齊——
// 比起用 Postgres trigger,放在應用層比較好追蹤與測試。
// 用 React cache 包起來,同一個 request 內多次呼叫只會打一次 DB。
export const getCurrentUser = cache(async () => {
  const supabase = createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser?.email) return null;

  const user = await prisma.user.upsert({
    where: { id: authUser.id },
    update: { email: authUser.email },
    create: {
      id: authUser.id,
      email: authUser.email,
      name:
        (authUser.user_metadata?.full_name as string | undefined) ??
        (authUser.user_metadata?.name as string | undefined) ??
        null,
      // Free 方案的試用額度(規劃書 §11.3)
      creditBalance: { create: {} },
    },
  });

  return user;
});
