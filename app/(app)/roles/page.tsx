import { createClient } from "@/lib/supabase/server";
import {
  createRole,
  createPermission,
  assignRolePermission,
  removeRolePermission,
  assignUserRole,
  removeUserRole,
  assignUserBranch,
  removeUserBranch,
  createUserAccount,
} from "./actions";

export default async function RolesPage() {
  const supabase = createClient();

const [
  { data: roles },
  { data: permissions },
  { data: rolePermissions },
  { data: users },
  { data: userRoles },
  { data: branches },
  { data: userBranches },
  ] = await Promise.all([
  supabase.from("role").select("*").order("created_at", { ascending: true }),
  supabase.from("permission").select("*").order("module", { ascending: true }),
  supabase.from("role_permission").select("*"),
  supabase.from("user").select("id, full_name, email, is_active").order("created_at", { ascending: true }),
  supabase.from("user_role").select("*"),
  supabase.from("branch").select("id, name"),
  supabase.from("user_branch").select("*"),
  ]);

const roleName = new Map((roles || []).map((r: any) => [r.id, r.name]));
  const permissionCode = new Map((permissions || []).map((p: any) => [p.id, p.code + " (" + p.module + ")"]));
  const userName = new Map((users || []).map((u: any) => [u.id, u.full_name || u.email]));
  const branchName = new Map((branches || []).map((b: any) => [b.id, b.name]));

const permsByRole = new Map<string, any[]>();
  (rolePermissions || []).forEach((rp: any) => {
    const list = permsByRole.get(rp.role_id) || [];
    list.push(rp);
    permsByRole.set(rp.role_id, list);
  });

return (
  <div className="space-y-8">
  <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-accent">System</div>div>
  <h1 className="mb-6 font-archivo text-2xl font-extrabold text-ink">Roles &amp; Permissions</h1>h1>
  <p className="mb-6 -mt-4 text-sm text-ink/60">Role-based access control: roles, permissions, and user assignments.</p>p>
  
  <section className="border-2 border-black/10 bg-white p-5">
  <div className="mb-4 flex items-center justify-between border-b-2 border-black/10 pb-3">
  <h2 className="font-archivo text-[13.5px] font-bold text-ink">Staff Login Accounts</h2>h2>
  <details className="relative">
  <summary className="cursor-pointer list-none rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white">
  + Create User Account
  </summary>summary>
  <form
    action={createUserAccount}
    className="absolute right-0 z-10 mt-2 w-80 space-y-3 border-2 border-black/10 bg-white p-4 shadow-lg"
    >
  <div>
  <label className="block text-xs font-medium text-slate-500">Full name</label>label>
  <input
    name="full_name"
    required
    placeholder="e.g. Priya Nair"
    className="mt-1 w-full border border-black/10 px-3 py-2 text-[13px]"
    />
  </div>div>
  <div>
  <label className="block text-xs font-medium text-slate-500">Email</label>label>
  <input
    type="email"
    name="email"
    required
    placeholder="staff@thelondonwash.com"
    className="mt-1 w-full border border-black/10 px-3 py-2 text-[13px]"
    />
  </div>div>
  <div>
  <label className="block text-xs font-medium text-slate-500">Password</label>label>
  <input
    type="text"
    name="password"
    required
    minLength={8}
    placeholder="min. 8 characters"
    className="mt-1 w-full border border-black/10 px-3 py-2 text-[13px]"
    />
  </div>div>
  <div>
  <label className="block text-xs font-medium text-slate-500">Role (optional)</label>label>
  <select name="role_id" className="mt-1 w-full border border-black/10 px-3 py-2 text-[13px]">
  <option value="">No role</option>option>
    {(roles || []).map((r: any) => (
      <option key={r.id} value={r.id}>
        {r.name}
      </option>option>
      ))}
  </select>select>
  </div>div>
  <div>
  <label className="block text-xs font-medium text-slate-500">Branch (optional)</label>label>
  <select name="branch_id" className="mt-1 w-full border border-black/10 px-3 py-2 text-[13px]">
  <option value="">No branch</option>option>
    {(branches || []).map((b: any) => (
      <option key={b.id} value={b.id}>
        {b.name}
      </option>option>
      ))}
  </select>select>
  </div>div>
  <button type="submit" className="w-full rounded-md bg-accent py-1.5 text-sm font-medium text-white">
  Create Account
  </button>button>
  </form>form>
  </details>details>
  </div>div>
  <table className="w-full text-sm">
  <thead>
  <tr className="border-b-2 border-black/10 text-left text-[11px] uppercase tracking-wide text-ink/50">
  <th className="py-2">Name</th>th>
  <th className="py-2">Email</th>th>
  <th className="py-2">Status</th>th>
  </tr>tr>
  </thead>thead>
  <tbody>
    {(users || []).map((u: any) => (
    <tr key={u.id} className="border-b border-black/5">
    <td className="py-2 font-medium">{u.full_name || "-"}</td>td>
    <td className="py-2 text-slate-600">{u.email}</td>td>
    <td className="py-2">
    <span
      className={
        "px-2 py-0.5 text-xs font-medium uppercase tracking-wide " +
        (u.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500")
      }
      >
      {u.is_active ? "Active" : "Inactive"}
    </span>span>
    </td>td>
    </tr>tr>
    ))}
    {(!users || users.length === 0) && (
    <tr>
    <td colSpan={3} className="py-4 text-center text-slate-400">
    No staff accounts yet.
    </td>td>
    </tr>tr>
  )}
  </tbody>tbody>
  </table>table>
  </section>section>
  </div>

  <section className="border-2 border-black/10 bg-white p-5">
  <div className="mb-4 flex items-center justify-between border-b-2 border-black/10 pb-3">
  <h2 className="font-archivo text-[13.5px] font-bold text-ink">Roles</h2>h2>
  <details className="relative">
  <summary className="cursor-pointer list-none rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">
  + New Role
  </summary>summary>
  <form
    action={createRole}
    className="absolute right-0 z-10 mt-2 w-80 space-y-3 border-2 border-black/10 bg-white p-4"
    >
  <div>
  <label className="block text-xs font-medium text-slate-500">Role name</label>label>
  <input
    name="name"
    required
    placeholder="e.g. Cashier"
    className="mt-1 w-full border border-black/10 px-3 py-2 text-[13px]"
    />
  </div>div>
  <div>
  <label className="block text-xs font-medium text-slate-500">Description</label>label>
  <input
    name="description"
    className="mt-1 w-full border border-black/10 px-3 py-2 text-[13px]"
    />
  </div>div>
  <button type="submit" className="w-full rounded-md bg-slate-900 py-1.5 text-sm font-medium text-white">
  Create Role
  </button>button>
  </form>form>
  </details>details>
  </div>div>
  <table className="w-full text-sm">
  <thead>
  <tr className="border-b-2 border-black/10 text-left text-[11px] uppercase tracking-wide text-ink/50">
  <th className="py-2">Name</th>th>
  <th className="py-2">Description</th>th>
  <th className="py-2">Type</th>th>
  <th className="py-2">Permissions</th>th>
  </tr>tr>
  </thead>thead>
  <tbody>
    {(roles || []).map((r: any) => (
    <tr key={r.id} className="border-b border-black/5">
    <td className="py-2 font-medium">{r.name}</td>td>
    <td className="py-2 text-slate-600">{r.description || "-"}</td>td>
    <td className="py-2 text-slate-600">
    <span
      className={
        "px-2 py-0.5 text-xs font-medium uppercase tracking-wide " +
        (r.is_system ? "bg-slate-100 text-slate-500" : "bg-emerald-100 text-emerald-700")
      }
      >
      {r.is_system ? "System" : "Custom"}
    </span>span>
    </td>td>
    <td className="py-2 text-slate-600">{(permsByRole.get(r.id) || []).length}</td>td>
    </tr>tr>
    ))}
    {(!roles || roles.length === 0) && (
    <tr>
    <td colSpan={4} className="py-4 text-center text-slate-400">
    No roles yet.
    </td>td>
    </tr>tr>
  )}
  </tbody>tbody>
  </table>table>
  </section>
  
  <section className="border-2 border-black/10 bg-white p-5">
  <div className="mb-4 flex items-center justify-between border-b-2 border-black/10 pb-3">
  <h2 className="font-archivo text-[13.5px] font-bold text-ink">Permissions</h2>h2>
  <details className="relative">
  <summary className="cursor-pointer list-none rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">
  + New Permission
  </summary>summary>
  <form
    action={createPermission}
    className="absolute right-0 z-10 mt-2 w-80 space-y-3 border-2 border-black/10 bg-white p-4"
    >
  <div>
  <label className="block text-xs font-medium text-slate-500">Code</label>label>
  <input
    name="code"
    required
    placeholder="e.g. orders.manage"
    className="mt-1 w-full border border-black/10 px-3 py-2 text-[13px]"
    />
  </div>div>
  <div>
  <label className="block text-xs font-medium text-slate-500">Module</label>label>
  <input
    name="module"
    required
    placeholder="e.g. Orders"
    className="mt-1 w-full border border-black/10 px-3 py-2 text-[13px]"
    />
  </div>div>
  <div>
  <label className="block text-xs font-medium text-slate-500">Description</label>label>
  <input
    name="description"
    className="mt-1 w-full border border-black/10 px-3 py-2 text-[13px]"
    />
  </div>div>
  <button type="submit" className="w-full rounded-md bg-slate-900 py-1.5 text-sm font-medium text-white">
  Create Permission
  </button>button>
  </form>form>
  </details>details>
  </div>div>
  <table className="w-full text-sm">
  <thead>
  <tr className="border-b-2 border-black/10 text-left text-[11px] uppercase tracking-wide text-ink/50">
  <th className="py-2">Code</th>th>
  <th className="py-2">Module</th>th>
  <th className="py-2">Description</th>th>
  </tr>tr>
  </thead>thead>
  <tbody>
    {(permissions || []).map((p: any) => (
    <tr key={p.id} className="border-b border-black/5">
    <td className="py-2 font-medium">{p.code}</td>td>
    <td className="py-2 text-slate-600">{p.module}</td>td>
    <td className="py-2 text-slate-600">{p.description || "-"}</td>td>
    </tr>tr>
    ))}
    {(!permissions || permissions.length === 0) && (
    <tr>
    <td colSpan={3} className="py-4 text-center text-slate-400">
    No permissions yet.
    </td>td>
    </tr>tr>
  )}
  </tbody>tbody>
  </table>table>
  </section>section>
  </div>
  <section className="border-2 border-black/10 bg-white p-5">
  <div className="mb-4 flex items-center justify-between border-b-2 border-black/10 pb-3">
  <h2 className="font-archivo text-[13.5px] font-bold text-ink">Role Permission Assignments</h2>h2>
  <details className="relative">
  <summary className="cursor-pointer list-none rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">
  + Assign Permission
  </summary>summary>
  <form
    action={assignRolePermission}
    className="absolute right-0 z-10 mt-2 w-80 space-y-3 border-2 border-black/10 bg-white p-4"
    >
  <div>
  <label className="block text-xs font-medium text-slate-500">Role</label>label>
  <select name="role_id" required className="mt-1 w-full border border-black/10 px-3 py-2 text-[13px]">
  <option value="">Select role</option>option>
    {(roles || []).map((r: any) => (
      <option key={r.id} value={r.id}>
        {r.name}
      </option>option>
      ))}
  </select>select>
  </div>div>
  <div>
  <label className="block text-xs font-medium text-slate-500">Permission</label>label>
  <select name="permission_id" required className="mt-1 w-full border border-black/10 px-3 py-2 text-[13px]">
  <option value="">Select permission</option>option>
    {(permissions || []).map((p: any) => (
      <option key={p.id} value={p.id}>
        {p.code}
      </option>option>
      ))}
  </select>select>
  </div>div>
  <button type="submit" className="w-full rounded-md bg-slate-900 py-1.5 text-sm font-medium text-white">
  Assign
  </button>button>
  </form>form>
  </details>details>
  </div>div>
  <table className="w-full text-sm">
  <thead>
  <tr className="border-b-2 border-black/10 text-left text-[11px] uppercase tracking-wide text-ink/50">
  <th className="py-2">Role</th>th>
  <th className="py-2">Permission</th>th>
  <th className="py-2"></th>th>
  </tr>tr>
  </thead>thead>
  <tbody>
    {(rolePermissions || []).map((rp: any) => (
    <tr key={rp.role_id + rp.permission_id} className="border-b border-black/5">
    <td className="py-2 font-medium">{roleName.get(rp.role_id) || "-"}</td>td>
    <td className="py-2 text-slate-600">{permissionCode.get(rp.permission_id) || "-"}</td>td>
    <td className="py-2">
    <form action={removeRolePermission}>
    <input type="hidden" name="role_id" value={rp.role_id} />
    <input type="hidden" name="permission_id" value={rp.permission_id} />
    <button type="submit" className="text-xs font-medium text-red-600">
    Remove
    </button>button>
    </form>form>
    </td>td>
    </tr>tr>
    ))}
    {(!rolePermissions || rolePermissions.length === 0) && (
    <tr>
    <td colSpan={3} className="py-4 text-center text-slate-400">
    No permission assignments yet.
    </td>td>
    </tr>tr>
  )}
  </tbody>tbody>
  </table>table>
  </section>
  
  <section className="border-2 border-black/10 bg-white p-5">
  <div className="mb-4 flex items-center justify-between border-b-2 border-black/10 pb-3">
  <h2 className="font-archivo text-[13.5px] font-bold text-ink">User Roles</h2>h2>
  <details className="relative">
  <summary className="cursor-pointer list-none rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">
  + Assign Role
  </summary>summary>
  <form
    action={assignUserRole}
    className="absolute right-0 z-10 mt-2 w-80 space-y-3 border-2 border-black/10 bg-white p-4"
    >
  <div>
  <label className="block text-xs font-medium text-slate-500">User</label>label>
  <select name="user_id" required className="mt-1 w-full border border-black/10 px-3 py-2 text-[13px]">
  <option value="">Select user</option>option>
    {(users || []).map((u: any) => (
      <option key={u.id} value={u.id}>
        {u.full_name || u.email}
      </option>option>
      ))}
  </select>select>
  </div>div>
  <div>
  <label className="block text-xs font-medium text-slate-500">Role</label>label>
  <select name="role_id" required className="mt-1 w-full border border-black/10 px-3 py-2 text-[13px]">
  <option value="">Select role</option>option>
    {(roles || []).map((r: any) => (
      <option key={r.id} value={r.id}>
        {r.name}
      </option>option>
      ))}
  </select>select>
  </div>div>
  <button type="submit" className="w-full rounded-md bg-slate-900 py-1.5 text-sm font-medium text-white">
  Assign
  </button>button>
  </form>form>
  </details>details>
  </div>div>
  <table className="w-full text-sm">
  <thead>
  <tr className="border-b-2 border-black/10 text-left text-[11px] uppercase tracking-wide text-ink/50">
  <th className="py-2">User</th>th>
  <th className="py-2">Role</th>th>
  <th className="py-2"></th>th>
  </tr>tr>
  </thead>thead>
  <tbody>
    {(userRoles || []).map((ur: any) => (
    <tr key={ur.user_id + ur.role_id} className="border-b border-black/5">
    <td className="py-2 font-medium">{userName.get(ur.user_id) || "-"}</td>td>
    <td className="py-2 text-slate-600">{roleName.get(ur.role_id) || "-"}</td>td>
    <td className="py-2">
    <form action={removeUserRole}>
    <input type="hidden" name="user_id" value={ur.user_id} />
    <input type="hidden" name="role_id" value={ur.role_id} />
    <button type="submit" className="text-xs font-medium text-red-600">
    Remove
    </button>button>
    </form>form>
    </td>td>
    </tr>tr>
    ))}
    {(!userRoles || userRoles.length === 0) && (
    <tr>
    <td colSpan={3} className="py-4 text-center text-slate-400">
    No user role assignments yet.
    </td>td>
    </tr>tr>
  )}
  </tbody>tbody>
  </table>table>
  </section>section>
  </div>
  <section className="border-2 border-black/10 bg-white p-5">
  <div className="mb-4 flex items-center justify-between border-b-2 border-black/10 pb-3">
  <h2 className="font-archivo text-[13.5px] font-bold text-ink">User Branch Access</h2>h2>
  <details className="relative">
  <summary className="cursor-pointer list-none rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">
  + Grant Branch Access
  </summary>summary>
  <form
    action={assignUserBranch}
    className="absolute right-0 z-10 mt-2 w-80 space-y-3 border-2 border-black/10 bg-white p-4"
    >
  <div>
  <label className="block text-xs font-medium text-slate-500">User</label>label>
  <select name="user_id" required className="mt-1 w-full border border-black/10 px-3 py-2 text-[13px]">
  <option value="">Select user</option>option>
    {(users || []).map((u: any) => (
      <option key={u.id} value={u.id}>
        {u.full_name || u.email}
      </option>option>
      ))}
  </select>select>
  </div>div>
  <div>
  <label className="block text-xs font-medium text-slate-500">Branch</label>label>
  <select name="branch_id" required className="mt-1 w-full border border-black/10 px-3 py-2 text-[13px]">
  <option value="">Select branch</option>option>
    {(branches || []).map((b: any) => (
      <option key={b.id} value={b.id}>
        {b.name}
      </option>option>
      ))}
  </select>select>
  </div>div>
  <button type="submit" className="w-full rounded-md bg-slate-900 py-1.5 text-sm font-medium text-white">
  Grant Access
  </button>button>
  </form>form>
  </details>details>
  </div>div>
  <table className="w-full text-sm">
  <thead>
  <tr className="border-b-2 border-black/10 text-left text-[11px] uppercase tracking-wide text-ink/50">
  <th className="py-2">User</th>th>
  <th className="py-2">Branch</th>th>
  <th className="py-2"></th>th>
  </tr>tr>
  </thead>thead>
  <tbody>
    {(userBranches || []).map((ub: any) => (
    <tr key={ub.user_id + ub.branch_id} className="border-b border-black/5">
    <td className="py-2 font-medium">{userName.get(ub.user_id) || "-"}</td>td>
    <td className="py-2 text-slate-600">{branchName.get(ub.branch_id) || "-"}</td>td>
    <td className="py-2">
    <form action={removeUserBranch}>
    <input type="hidden" name="user_id" value={ub.user_id} />
    <input type="hidden" name="branch_id" value={ub.branch_id} />
    <button type="submit" className="text-xs font-medium text-red-600">
    Remove
    </button>button>
    </form>form>
    </td>td>
    </tr>tr>
    ))}
    {(!userBranches || userBranches.length === 0) && (
    <tr>
    <td colSpan={3} className="py-4 text-center text-slate-400">
    No branch access grants yet.
    </td>td>
    </tr>tr>
  )}
  </tbody>tbody>
  </table>table>
  </section>
  </>div>
  );
}
</div>
