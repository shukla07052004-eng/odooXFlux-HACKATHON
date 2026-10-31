import { NextRequest } from "next/server";
import { z } from "zod";
import pool from "@/lib/db";
import { requireApiUser } from "@/lib/auth/session";
import { authErrorResponse, validationError } from "@/lib/auth/http";
const statusMap:Record<string,string>={Draft:"draft",Sent:"sent",Accepted:"accepted",Rejected:"rejected",Converted:"converted"};
export async function GET(request:NextRequest,context:{params:Promise<{id:string}>}){const auth=await requireApiUser(request);if(!auth.user)return auth.response;const {id}=await context.params;try{const result=await pool.query(`SELECT q.*,u.name AS customer_name,COALESCE(json_agg(json_build_object('id',qi.id,'product_id',qi.product_id,'description',qi.description,'quantity',qi.quantity,'unit_price',qi.unit_price,'tax_rate',qi.tax_rate)) FILTER(WHERE qi.id IS NOT NULL),'[]') AS items FROM quotations q JOIN users u ON u.id=q.customer_id LEFT JOIN quotation_items qi ON qi.quotation_id=q.id WHERE q.id=$1 AND ($2::text='admin' OR ($2::text='customer' AND q.customer_id=$3) OR ($2::text='staff' AND u.assigned_staff_id=$3)) GROUP BY q.id,u.name`,[id,auth.user.role,auth.user.id]);if(!result.rows[0])return validationError("Quotation not found.",404);return Response.json({data:result.rows[0]});}catch(error){return authErrorResponse(error,"quotations:detail");}}
export async function PATCH(request:NextRequest,context:{params:Promise<{id:string}>}) {
  const auth=await requireApiUser(request,["admin","staff"]);
  if(!auth.user)return auth.response;
  const {id}=await context.params;
  let body:unknown;
  try { body=await request.json(); } catch { return validationError("Quotation details are invalid."); }
  const parsed=z.object({status:z.enum(["Draft","Sent","Accepted","Rejected"]).optional(),valid_until:z.string().date().optional(),notes:z.string().max(2000).optional()}).refine((value)=>Object.keys(value).length>0).safeParse(body);
  if(!parsed.success)return validationError(parsed.error.issues[0]?.message??"Quotation details are invalid.");
  const value=parsed.data;
  const client=await pool.connect();
  try {
    await client.query("BEGIN");
    const current=await client.query(`SELECT q.id,q.status FROM quotations q JOIN users u ON u.id=q.customer_id WHERE q.id=$1 AND ($2::text='admin' OR u.assigned_staff_id=$3) FOR UPDATE OF q`,[id,auth.user.role,auth.user.id]);
    if(!current.rows[0]){await client.query("ROLLBACK");return validationError("Quotation not found or outside your assigned customers.",404);}
    const currentStatus=String(current.rows[0].status);
    const nextStatus=value.status?statusMap[value.status]:currentStatus;
    const validTransition=nextStatus===currentStatus||(currentStatus==="draft"&&nextStatus==="sent")||(currentStatus==="sent"&&["accepted","rejected"].includes(nextStatus));
    if(currentStatus==="converted"||(value.status&&!validTransition)){await client.query("ROLLBACK");return validationError("Quotation status transition is not allowed.",409);}
    const result=await client.query(`UPDATE quotations SET status=$1,valid_until=COALESCE($2,valid_until),notes=COALESCE($3,notes) WHERE id=$4 RETURNING id,status,valid_until,notes`,[nextStatus,value.valid_until??null,value.notes??null,id]);
    await client.query("COMMIT");
    return Response.json({data:result.rows[0]});
  } catch(error){await client.query("ROLLBACK").catch(()=>undefined);return authErrorResponse(error,"quotations:update");}
  finally {client.release();}
}
export async function DELETE(request:NextRequest,context:{params:Promise<{id:string}>}){const auth=await requireApiUser(request,["admin"]);if(!auth.user)return auth.response;const {id}=await context.params;try{const result=await pool.query("DELETE FROM quotations WHERE id=$1 AND status<>'converted' RETURNING id",[id]);if(!result.rowCount)return validationError("Quotation not found or already converted.",404);return Response.json({success:true});}catch(error){return authErrorResponse(error,"quotations:delete");}}
