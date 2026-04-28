/**
 * Resolves a single masterlist employee for OCR auto-linking.
 * We only set employee_id / apply patches when the match is unambiguous
 * (one clear owner per file, no cross-employee data writes).
 */
export function resolveOwnerEmployeeForOcrNameMatches(
  nameKeyMatches: any[],
  dobIso: string | null
): { id: string | null; warning: string | null } {
  const n = nameKeyMatches.length;
  if (n === 0) {
    return {
      id: null,
      warning: "No masterlist person matches this name. Add the employee or link manually after review.",
    };
  }

  if (dobIso) {
    const exactDob = nameKeyMatches.filter((c) => String(c.date_of_birth || "") === dobIso);
    if (exactDob.length === 1) {
      return { id: String(exactDob[0].id), warning: null };
    }
    if (exactDob.length > 1) {
      return {
        id: null,
        warning: "Several masterlist records share this name and birth date. Link the correct person manually in review.",
      };
    }
    // No exact DOB match: only allow a single name match with no DOB on file (first-time fill)
    if (n === 1 && !nameKeyMatches[0].date_of_birth) {
      return { id: String(nameKeyMatches[0].id), warning: null };
    }
    return {
      id: null,
      warning:
        "Date of birth does not match, or more than one person shares this name. Use review to link the right employee.",
    };
  }

  // No DOB in the scan — only auto-link if exactly one name match exists
  if (n === 1) {
    return { id: String(nameKeyMatches[0].id), warning: null };
  }
  return {
    id: null,
    warning: "More than one employee shares this name. Add or verify date of birth on the form, or link manually in review.",
  };
}
