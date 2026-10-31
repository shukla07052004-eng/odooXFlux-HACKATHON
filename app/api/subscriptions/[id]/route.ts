import { NextRequest } from "next/server";
import { z } from "zod";
import pool from "@/lib/db";
import { requireApiUser } from "@/lib/auth/session";
import { authErrorResponse, validationError } from "@/lib/auth/http";

type Params = { params: Promise<{ id: string }> };
const updateSchema=z.object({status:z.enum(["Draft","Quotation","Confirmed","Active","Paused","Closed"]).optional(),expiry_date:z.string().date().optional().or(z.literal("")),payment_terms:z.string().max(40).optional()});
const statusMap:Record<string,string>={Draft:"draft",Quotation:"quotation",Confirmed:"confirmed",Active:"active",Paused:"paused",Closed:"closed"};
const transitions:Record<string,string[]>={draft:["quotation","closed"],quotation:["confirmed","closed"],confirmed:["active","closed"],active:["paused","closed"],paused:["active","closed"],closed:["active"]};

export async function GET(request:NextRequest,context:Params){const auth=await requireApiUser(request);if(!auth.user)return auth.response;const {id}=await context.params;try{const result=await pool.query(`SELECT s.id,s.subscription_number,s.customer_id,u.name AS customer_name,s.plan_id,p.name AS plan_name,p.billing_interval,s.start_date,s.expiry_date,s.next_billing_date,s.payment_terms,s.subtotal,s.tax_amount,s.total_amount,s.status,s.created_at,COALESCE(json_agg(json_build_object('id',si.id,'product_id',si.product_id,'variant_id',si.variant_id,'description',si.description,'quantity',si.quantity,'unit_price',si.unit_price,'tax_rate',si.tax_rate)) FILTER(WHERE si.id IS NOT NULL),'[]') AS items FROM subscriptions s JOIN users u ON u.id=s.customer_id LEFT JOIN plans p ON p.id=s.plan_id LEFT JOIN subscription_items si ON si.subscription_id=s.id WHERE s.id=$1 AND ($2::text='admin' OR ($2::text='customer' AND s.customer_id=$3) OR ($2::text='staff' AND u.assigned_staff_id=$3)) GROUP BY s.id,u.name,p.name,p.billing_interval`,[id,auth.user.role,auth.user.id]);if(!result.rows[0])return validationError("Subscription not found.",404);return Response.json({data:result.rows[0]});}catch(error){return authErrorResponse(error,"subscriptions:detail");}}

export async function PATCH(request:NextRequest,context:Params){
  const auth=await requireApiUser(request);if(!auth.user)return auth.response;
  const {id}=await context.params;let body:unknown;try{body=await request.json();}catch{return validationError("Subscription update is invalid.");}
  const parsed=updateSchema.safeParse(body);if(!parsed.success)return validationError(parsed.error.issues[0]?.message??"Subscription update is invalid.");
  if(auth.user.role==="customer"&&(parsed.data.expiry_date!==undefined||parsed.data.payment_terms!==undefined))return validationError("Customers can only pause or resume their own subscriptions.",403);
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    const found=await client.query(`SELECT s.id,s.status,s.expiry_date,s.payment_terms,p.allow_pause,p.allow_renewal,p.billing_interval,u.assigned_staff_id FROM subscriptions s JOIN plans p ON p.id=s.plan_id JOIN users u ON u.id=s.customer_id WHERE s.id=$1 AND ($2::text='admin' OR ($2::text='customer' AND s.customer_id=$3) OR ($2::text='staff' AND u.assigned_staff_id=$3)) FOR UPDATE OF s`,[id,auth.user.role,auth.user.id]);
    const current=found.rows[0];if(!current){await client.query("ROLLBACK");return validationError("Subscription not found or outside your assigned customers.",404);}
    const oldStatus=current.status as string;const nextStatus=parsed.data.status?statusMap[parsed.data.status]:oldStatus;
    if(nextStatus!==oldStatus&&!transitions[oldStatus]?.includes(nextStatus)){await client.query("ROLLBACK");return validationError(`Subscription cannot move from ${oldStatus} to ${nextStatus}.`,409);}
    if(nextStatus==="paused"&&!current.allow_pause){await client.query("ROLLBACK");return validationError("This plan does not allow subscriptions to pause.",409);}
    if(oldStatus==="closed"&&nextStatus==="active"&&!current.allow_renewal){await client.query("ROLLBACK");return validationError("This plan does not allow renewal.",409);}
    if(auth.user.role==="customer"&&!((oldStatus==="active"&&nextStatus==="paused"&&current.allow_pause)||(oldStatus==="paused"&&nextStatus==="active"&&current.allow_pause))){await client.query("ROLLBACK");return validationError("Customers can only pause or resume their own eligible subscription.",403);}
    const result=await client.query(`UPDATE subscriptions SET status=$1,expiry_date=CASE WHEN $2 IS NULL THEN CASE WHEN $1='active' AND expiry_date<CURRENT_DATE THEN (CURRENT_DATE+CASE (SELECT billing_interval FROM plans WHERE id=plan_id) WHEN 'daily' THEN INTERVAL '1 day' WHEN 'weekly' THEN INTERVAL '1 week' WHEN 'yearly' THEN INTERVAL '1 year' ELSE INTERVAL '1 month' END)::date ELSE expiry_date END ELSE NULLIF($2,'')::date END,next_billing_date=CASE WHEN $1='active' AND status IN ('paused','closed') THEN CURRENT_DATE ELSE next_billing_date END,payment_terms=COALESCE($3,payment_terms) WHERE id=$4 RETURNING id,status,expiry_date,next_billing_date`,[nextStatus,parsed.data.expiry_date===undefined?null:parsed.data.expiry_date,auth.user.role==="customer"?null:parsed.data.payment_terms??null,id]);
    await client.query("COMMIT");return Response.json({data:result.rows[0]});
  }catch(error){await client.query("ROLLBACK").catch(()=>undefined);return authErrorResponse(error,"subscriptions:update");}finally{client.release();}
}

export async function DELETE(request:NextRequest,context:Params){const auth=await requireApiUser(request,["admin"]);if(!auth.user)return auth.response;const {id}=await context.params;try{const result=await pool.query("DELETE FROM subscriptions WHERE id=$1 AND status IN ('draft','closed') RETURNING id",[id]);if(!result.rowCount)return validationError("Only draft or closed subscriptions can be deleted.",409);return Response.json({success:true});}catch(error){return authErrorResponse(error,"subscriptions:delete");}}
