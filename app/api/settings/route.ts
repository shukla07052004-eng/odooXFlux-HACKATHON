import { z } from "zod";
import pool from "@/lib/db";
import { requireApiUser } from "@/lib/auth/session";
import { authErrorResponse, validationError } from "@/lib/auth/http";

const schema = z.object({ business_name:z.string().trim().min(1).max(150),support_email:z.string().trim().email().max(255).optional().or(z.literal("")),phone:z.string().max(40).optional(),website:z.string().max(255).optional(),billing_address:z.string().max(1000).optional(),currency:z.enum(["INR","USD","EUR"]),payment_terms:z.enum(["Due on receipt","Net 15","Net 30","Net 45"]),tax_rate:z.coerce.number().min(0).max(100),invoice_prefix:z.string().trim().min(1).max(20),reminder_30_days:z.string().optional(),reminder_7_days:z.string().optional(),reminder_1_day:z.string().optional()});

export async function GET(request:Request) {
  const auth=await requireApiUser(request,["admin"]);if(!auth.user)return auth.response;
  try {
    const result=await pool.query("SELECT setting_value FROM workspace_settings WHERE setting_key='workspace'");
    return Response.json({data:result.rows[0]?.setting_value??{business_name:"Brightloop Software",currency:"INR",payment_terms:"Net 30",tax_rate:18,invoice_prefix:"BL-INV"}});
  } catch(error) { return authErrorResponse(error,"settings:read"); }
}

export async function PATCH(request:Request) {
  const auth=await requireApiUser(request,["admin"]);if(!auth.user)return auth.response;
  const parsed=schema.safeParse(await request.json());
  if(!parsed.success)return validationError(parsed.error.issues[0]?.message??"Workspace settings are invalid.");
  const value={...parsed.data,reminder_30_days:Boolean(parsed.data.reminder_30_days),reminder_7_days:Boolean(parsed.data.reminder_7_days),reminder_1_day:Boolean(parsed.data.reminder_1_day)};
  const client=await pool.connect();
  try {
    await client.query("BEGIN");
    const result=await client.query("INSERT INTO workspace_settings(setting_key,setting_value,updated_at) VALUES('workspace',$1::jsonb,NOW()) ON CONFLICT(setting_key) DO UPDATE SET setting_value=EXCLUDED.setting_value,updated_at=NOW() RETURNING setting_value",[JSON.stringify(value)]);
    await client.query("UPDATE taxes SET is_default=FALSE WHERE is_default=TRUE AND name<>'Standard'");
    await client.query("INSERT INTO taxes(name,rate,is_active,is_default) VALUES('Standard',$1,TRUE,TRUE) ON CONFLICT(name) DO UPDATE SET rate=EXCLUDED.rate,is_active=TRUE,is_default=TRUE",[value.tax_rate]);
    await client.query("COMMIT");
    return Response.json({success:true,data:result.rows[0].setting_value});
  } catch(error) {
    await client.query("ROLLBACK").catch(()=>undefined);
    return authErrorResponse(error,"settings:update");
  } finally { client.release(); }
}
