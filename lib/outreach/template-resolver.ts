import type { CSVRow, EnrichmentResult, TemplateVariable } from "@/lib/types";

export class TemplateResolver {
  /**
   * Extract all available template variables from a project's data.
   */
  static getAvailableVariables(
    csvColumns: string[],
    enrichmentFieldNames: string[],
    aiColumnNames?: string[],
  ): TemplateVariable[] {
    const variables: TemplateVariable[] = [];

    for (const col of csvColumns) {
      variables.push({
        key: col,
        displayName: col,
        source: "CSV",
      });
    }

    for (const field of enrichmentFieldNames) {
      // Namespaced fields like "ContactSearch__CEO_email"
      const parts = field.split("__");
      const displayName =
        parts.length > 1 ? `${parts[1]} (${parts[0]})` : field;
      const source = parts.length > 1 ? parts[0] : "Enrichment";

      variables.push({
        key: field,
        displayName,
        source,
      });
    }

    if (aiColumnNames) {
      for (const col of aiColumnNames) {
        variables.push({
          key: `ai__${col}`,
          displayName: col,
          source: "AI Column",
        });
      }
    }

    return variables;
  }

  /**
   * Resolve a template string by replacing {{variableName}} with actual values.
   */
  static resolveTemplate(
    template: string,
    rowData: CSVRow,
    enrichments: Record<string, EnrichmentResult>,
    aiColumnResults?: Record<string, unknown>,
  ): string {
    return template.replace(/\{\{(\w[\w_]*)\}\}/g, (_match, key: string) => {
      // 1. Check enrichment results
      if (enrichments[key]?.value !== undefined && enrichments[key].value !== null) {
        const val = enrichments[key].value;
        return Array.isArray(val) ? val.join(", ") : String(val);
      }
      // 2. Check CSV row data
      if (rowData[key] !== undefined && rowData[key] !== "") {
        return rowData[key];
      }
      // 3. Check AI column results (prefixed with ai__)
      if (key.startsWith("ai__") && aiColumnResults) {
        const aiKey = key.slice(4);
        if (aiColumnResults[aiKey] !== undefined) {
          return String(aiColumnResults[aiKey]);
        }
      }
      // 4. Also check AI results without prefix
      if (aiColumnResults?.[key] !== undefined) {
        return String(aiColumnResults[key]);
      }
      // 5. Return empty string for unresolved vars
      return "";
    });
  }

  /**
   * Convert our {{variableName}} syntax to BillionMail's {{.API.variableName}} syntax
   */
  static toBillionMailTemplate(template: string): string {
    return template.replace(/\{\{(\w[\w_]*)\}\}/g, "{{.API.$1}}");
  }

  /**
   * Build BillionMail attribs object from row data + enrichments
   */
  static buildBillionMailAttribs(
    rowData: CSVRow,
    enrichments: Record<string, EnrichmentResult>,
    aiColumnResults?: Record<string, unknown>,
  ): Record<string, string> {
    const attribs: Record<string, string> = {};

    // Add CSV data
    for (const [key, value] of Object.entries(rowData)) {
      if (value) attribs[key] = value;
    }

    // Add enrichment results
    for (const [key, result] of Object.entries(enrichments)) {
      if (result.value !== undefined && result.value !== null) {
        attribs[key] = Array.isArray(result.value)
          ? result.value.join(", ")
          : String(result.value);
      }
    }

    // Add AI column results
    if (aiColumnResults) {
      for (const [key, value] of Object.entries(aiColumnResults)) {
        if (value !== undefined && value !== null) {
          attribs[`ai__${key}`] = String(value);
        }
      }
    }

    return attribs;
  }
}
