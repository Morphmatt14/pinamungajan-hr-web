import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  
  const { searchParams } = new URL(request.url);
  const employeeId = searchParams.get("employee_id");
  
  if (!employeeId) {
    return NextResponse.json({ error: "Missing employee_id" }, { status: 400 });
  }
  
  // Get current employee data
  const { data: employee, error: empError } = await supabase
    .from("employees")
    .select("*")
    .eq("id", employeeId)
    .single();
  
  if (empError) {
    return NextResponse.json({ error: "Employee not found", details: empError }, { status: 404 });
  }
  
  // Try to update with test data
  const testUpdate = {
    position_title: "TEST POSITION",
    office_department: "TEST OFFICE",
    sg: 99,
    step: 9,
    monthly_salary: 99999,
    annual_salary: 1199988,
  };
  
  const { error: updateError } = await supabase
    .from("employees")
    .update(testUpdate)
    .eq("id", employeeId);
  
  if (updateError) {
    return NextResponse.json({
      error: "Update failed",
      details: updateError,
      message: updateError.message,
      code: updateError.code,
      hint: "This usually means the column doesn't exist in the database",
    }, { status: 500 });
  }
  
  // Revert the test update
  await supabase
    .from("employees")
    .update({
      position_title: employee?.position_title,
      office_department: employee?.office_department,
      sg: employee?.sg,
      step: employee?.step,
      monthly_salary: employee?.monthly_salary,
      annual_salary: employee?.annual_salary,
    })
    .eq("id", employeeId);
  
  return NextResponse.json({
    success: true,
    message: "Test update worked - columns exist",
    employee_before: employee,
    test_data: testUpdate,
  });
}
