"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

async function getContext(supabase: ReturnType<typeof createClient>) {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return null;
    const { data: me } = await supabase
      .from("user")
      .select("organization_id, branch_id")
      .eq("auth_user_id", auth.user.id)
      .single();
    return me;
}

export async function createRole(formData: FormData) {
    const name = String(formData.get("name") || "").trim();
    if (!name) return;
    const description = String(formData.get("description") || "").trim() || null;
    const supabase = createClient();
    const ctx = await getContext(supabase);
    if (!ctx?.organization_id) return;
    const { error } = await supabase
      .from("role")
      .insert({ organization_id: ctx.organization_id, name, description, is_system: false });
    if (error) console.error(error);
    revalidatePath("/roles");
}

export async function createPermission(formData: FormData) {
    const code = String(formData.get("code") || "").trim();
    const module_ = String(formData.get("module") || "").trim();
    if (!code || !module_) return;
    const description = String(formData.get("description") || "").trim() || null;
    const supabase = createClient();
    const { error } = await supabase.from("permission").insert({ code, module: module_, description });
    if (error) console.error(error);
    revalidatePath("/roles");
}

export async function assignRolePermission(formData: FormData) {
    const role_id = String(formData.get("role_id") || "");
    const permission_id = String(formData.get("permission_id") || "");
    if (!role_id || !permission_id) return;
    const supabase = createClient();
    const { error } = await supabase.from("role_permission").insert({ role_id, permission_id });
    if (error) console.error(error);
    revalidatePath("/roles");
}

export async function removeRolePermission(formData: FormData) {
    const role_id = String(formData.get("role_id") || "");
    const permission_id = String(formData.get("permission_id") || "");
        if (!role_id || !permission_id) return;
    const supabase = createClient();
    const { error } = await supabase
      .from("role_permission")
      .delete()
      .eq("role_id", role_id)
      .eq("permission_id", permission_id);
    if (error) console.error(error);
    revalidatePath("/roles");
}

export async function assignUserRole(formData: FormData) {
    const user_id = String(formData.get("user_id") || "");
    const role_id = String(formData.get("role_id") || "");
    if (!user_id || !role_id) return;
    const supabase = createClient();
    const { error } = await supabase.from("user_role").insert({ user_id, role_id });
    if (error) console.error(error);
    revalidatePath("/roles");
}

export async function removeUserRole(formData: FormData) {
    const user_id = String(formData.get("user_id") || "");
    const role_id = String(formData.get("role_id") || "");
    if (!user_id || !role_id) return;
    const supabase = createClient();
    const { error } = await supabase
      .from("user_role")
      .delete()
      .eq("user_id", user_id)
      .eq("role_id", role_id);
    if (error) console.error(error);
    revalidatePath("/roles");
}

export async function assignUserBranch(formData: FormData) {
    const user_id = String(formData.get("user_id") || "");
    const branch_id = String(formData.get("branch_id") || "");
    if (!user_id || !branch_id) return;
    const supabase = createClient();
    const { error } = await supabase.from("user_branch").insert({ user_id, branch_id });
    if (error) console.error(error);
    revalidatePath("/roles");
}

export async function removeUserBranch(formData: FormData) {
    const user_id = String(formData.get("user_id") || "");
    const branch_id = String(formData.get("branch_id") || "");
    if (!user_id || !branch_id) return;
    const supabase = createClient();
    const { error } = await supabase
      .from("user_branch")
      .delete()
      .eq("user_id", user_id)
      .eq("branch_id", branch_id);
    if (error) console.error(error);
    revalidatePath("/roles");
}

export async function createUserAccount(formData: FormData) {
    const full_name = String(formData.get("full_name") || "").trim();
    const email = String(formData.get("email") || "").trim().toLowerCase();
    const password = String(formData.get("password") || "");
    const role_id = String(formData.get("role_id") || "");
    const branch_id = String(formData.get("branch_id") || "");

  if (!full_name || !email || !password || password.length < 8) return;

  const supabase = createClient();
    const ctx = await getContext(supabase);
    if (!ctx?.organization_id) return;

  const admin = createAdminClient();

  const { data: created, error: authError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
  });

  if (authError || !created?.user) {
        console.error(authError);
        return;
  }

  const { data: newUser, error: insertError } = await admin
      .from("user")
      .insert({
              organization_id: ctx.organization_id,
              branch_id: branch_id || null,
              full_name,
              email,
              password_hash: "managed_by_supabase_auth",
              auth_user_id: created.user.id,
              is_active: true,
      })
      .select("id")
      .single();

  if (insertError || !newUser) {
        console.error(insertError);
        await admin.auth.admin.deleteUser(created.user.id);
        return;
  }

  if (role_id) {
        const { error } = await admin.from("user_role").insert({ user_id: newUser.id, role_id });
        if (error) console.error(error);
  }
    if (branch_id) {
          const { error } = await admin.from("user_branch").insert({ user_id: newUser.id, branch_id });
          if (error) console.error(error);
    }

  revalidatePath("/roles");
}
