export type BillingRecord = { id: string; status?: string; [key: string]: unknown };

export type ColumnDefinition = {
  key: string;
  label: string;
  format?: "currency" | "date" | "status";
};

export type FormFieldDefinition = {
  key: string;
  label: string;
  type?: "text" | "email" | "tel" | "number" | "date" | "textarea";
  required?: boolean;
  options?: string[];
  placeholder?: string;
};
