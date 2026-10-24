// The setting is additive to current schema-5 snapshots; historical restricted drawings remain unchanged.
import { render } from "svelte/server";
import { describe, expect, it } from "vitest";
import { documentsFoundSnapshot } from "../../../src/test-support/sample-snapshots.js";
import DocumentsFound from "./DocumentsFound.svelte";
function page(enabled: boolean) {
  const snapshot=documentsFoundSnapshot();snapshot.settings.developmentDeployments={enabled,targets:[]};snapshot.repositories=snapshot.repositories.map(row=>({...row,github:"github.com/acme/acme-shop"}));
  return render(DocumentsFound,{props:{snapshot,config:{token:"fixture-token",base:"/customer-returns"},connected:true,now:Date.now()}}).body;
}
describe("current execution development setting",()=>{
  it("offers the new off-by-default option with its shared-environment risk",()=>{
    const html=page(false);expect(html).toContain("Allow development deployments");expect(html).toContain("shared development environments before the PRD finishes");const option=html.match(/<label\b[^>]*>(?:(?!<\/label>)[\s\S])*Allow development deployments(?:(?!<\/label>)[\s\S])*<\/label>/)?.[0];expect(option).toBeDefined();expect(option).not.toContain('checked=""');
  });
  it("identifies actual repository/base and demands an explicit non-production target",()=>{
    const html=page(true);expect(html).toContain("github.com/acme/acme-shop");expect(html).toContain("Approve a target in this repository");expect(html).toContain("Required checkpoint delivery may happen on approved targets");expect(html).not.toContain("Never merge, deploy, or touch other branches");
  });
});
