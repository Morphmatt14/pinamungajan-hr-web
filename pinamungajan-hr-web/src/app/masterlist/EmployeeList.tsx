import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DeleteEmployeeButton } from "@/app/masterlist/DeleteEmployeeButton";
import { computeAgeAndGroupFromDobIso } from "@/lib/age";
import { formatDateDdMmYyyy } from "@/lib/pds/validators";

export const revalidate = 0;

export async function EmployeeList() {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("employees")
    .select(
      "id, last_name, first_name, middle_name, date_of_birth, position_title, office_department, sg, step, monthly_salary, annual_salary, tenure_years, tenure_months, gender"
    )
    .order("last_name", { ascending: true })
    .limit(50);

  if (error) {
    return <div className="text-sm text-red-700">Error: {error.message}</div>;
  }

  return (
    <div className="rounded-lg border bg-white overflow-hidden">
      <div className="border-b px-4 py-3 text-sm font-medium">Employees (first 50)</div>
      <div className="overflow-auto">
        <table className="w-full min-w-[1400px] text-sm">
          <thead className="bg-zinc-50 text-zinc-900">
            <tr>
              <th className="px-3 py-2 text-left">Last name</th>
              <th className="px-3 py-2 text-left">First name</th>
              <th className="px-3 py-2 text-left">Middle name</th>
              <th className="px-3 py-2 text-left">Date of birth</th>
              <th className="px-3 py-2 text-left">Tenure</th>
              <th className="px-3 py-2 text-left">Office</th>
              <th className="px-3 py-2 text-left">Position</th>
              <th className="px-3 py-2 text-left">SG</th>
              <th className="px-3 py-2 text-left">Step</th>
              <th className="px-3 py-2 text-left">Monthly</th>
              <th className="px-3 py-2 text-left">Annual</th>
              <th className="px-3 py-2 text-left">Gender</th>
              <th className="px-3 py-2 text-left">Delete</th>
            </tr>
          </thead>
          <tbody>
            {(data || []).map((e) => (
              <tr key={e.id} className="border-t text-zinc-900">
                <td className="px-3 py-2 whitespace-nowrap">{e.last_name}</td>
                <td className="px-3 py-2 whitespace-nowrap">{e.first_name}</td>
                <td className="px-3 py-2 whitespace-nowrap">{e.middle_name || ""}</td>
                <td className="px-3 py-2">
                  {formatDateDdMmYyyy((e as any).date_of_birth)}
                </td>
                <td className="px-3 py-2">
                  {(() => {
                    const emp = e as any;
                    if (emp.tenure_years || emp.tenure_months) {
                      const years = emp.tenure_years || 0;
                      const months = emp.tenure_months || 0;
                      if (years > 0 && months > 0) return `${years}y ${months}m`;
                      if (years > 0) return `${years}y`;
                      if (months > 0) return `${months}m`;
                    }
                    return "";
                  })()}
                </td>
                <td className="px-3 py-2">{e.office_department}</td>
                <td className="px-3 py-2">{e.position_title}</td>
                <td className="px-3 py-2">{e.sg}</td>
                <td className="px-3 py-2">{(e as any).step || ""}</td>
                <td className="px-3 py-2">
                  {e.monthly_salary ? `₱${Number(e.monthly_salary).toLocaleString('en-PH', {minimumFractionDigits: 2, maximumFractionDigits: 2})}` : ""}
                </td>
                <td className="px-3 py-2">
                  {e.annual_salary ? `₱${Number(e.annual_salary).toLocaleString('en-PH', {minimumFractionDigits: 2, maximumFractionDigits: 2})}` : ""}
                </td>
                <td className="px-3 py-2">{e.gender}</td>
                <td className="px-3 py-2">
                  <DeleteEmployeeButton employeeId={e.id} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
