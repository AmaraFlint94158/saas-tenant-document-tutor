import assert from "node:assert/strict";
import test from "node:test";
import { decideDocumentAccess, questionSchema } from "../src/tenant_document_qa.js";

test("an active tenant may ask its handbook", () => {
  const request = questionSchema.parse({
    tenant_id: "acme-learning",
    account_status: "active",
    question: "How does an admin export course completion records?"
  });
  assert.equal(decideDocumentAccess(request.account_status), "allow");
});

test("a suspended tenant is denied before document retrieval", () => {
  assert.equal(decideDocumentAccess("suspended"), "deny");
});

test("unknown request fields are rejected", () => {
  assert.throws(() => questionSchema.parse({
    tenant_id: "acme-learning",
    account_status: "active",
    question: "How do I invite an instructor?",
    role: "owner"
  }), /Unrecognized key/);
});
