/**
 * Salary Grade Lookup Table (SG 1-30, Steps 1-8)
 * Based on Philippine government salary standardization
 * Values are monthly salaries in PHP
 */
export const SALARY_GRADE_TABLE: Record<number, Record<number, number>> = {
  1: { 1: 12655, 2: 12748, 3: 12850, 4: 12954, 5: 13058, 6: 13163, 7: 13269, 8: 13376 },
  2: { 1: 13433, 2: 13532, 3: 13631, 4: 13732, 5: 13834, 6: 13936, 7: 14039, 8: 14143 },
  3: { 1: 14267, 2: 14374, 3: 14479, 4: 14587, 5: 14696, 6: 14803, 7: 14914, 8: 15024 },
  4: { 1: 15150, 2: 15262, 3: 15376, 4: 15488, 5: 15603, 6: 15718, 7: 15835, 8: 15952 },
  5: { 1: 16079, 2: 16200, 3: 16320, 4: 16440, 5: 16561, 6: 16684, 7: 16808, 8: 16932 },
  6: { 1: 17061, 2: 17188, 3: 17315, 4: 17445, 5: 17573, 6: 17703, 7: 17834, 8: 17967 },
  7: { 1: 18099, 2: 18232, 3: 18367, 4: 18504, 5: 18640, 6: 18779, 7: 18917, 8: 19058 },
  8: { 1: 19303, 2: 19478, 3: 19655, 4: 19832, 5: 20011, 6: 20192, 7: 20374, 8: 20559 },
  9: { 1: 20903, 2: 21070, 3: 21239, 4: 21409, 5: 21580, 6: 21753, 7: 21928, 8: 22102 },
  10: { 1: 23027, 2: 23211, 3: 23396, 4: 23583, 5: 23771, 6: 23961, 7: 24152, 8: 24345 },
  11: { 1: 27022, 2: 27277, 3: 27537, 4: 27800, 5: 28067, 6: 28337, 7: 28611, 8: 28889 },
  12: { 1: 29021, 2: 29276, 3: 29535, 4: 29797, 5: 30063, 6: 30332, 7: 30604, 8: 30879 },
  13: { 1: 30979, 2: 31260, 3: 31544, 4: 31832, 5: 32125, 6: 32420, 7: 32719, 8: 33022 },
  14: { 1: 33322, 2: 33646, 3: 33974, 4: 34306, 5: 34642, 6: 34982, 7: 35327, 8: 35676 },
  15: { 1: 36187, 2: 36544, 3: 36905, 4: 37272, 5: 37642, 6: 38017, 7: 38396, 8: 38781 },
  16: { 1: 39204, 2: 39596, 3: 39994, 4: 40397, 5: 40804, 6: 41216, 7: 41635, 8: 42057 },
  17: { 1: 42522, 2: 42954, 3: 43392, 4: 43835, 5: 44283, 6: 44737, 7: 45196, 8: 45662 },
  18: { 1: 46174, 2: 46649, 3: 47130, 4: 47616, 5: 48110, 6: 48609, 7: 49115, 8: 49626 },
  19: { 1: 50751, 2: 51449, 3: 52158, 4: 52878, 5: 53610, 6: 54355, 7: 55112, 8: 55880 },
  20: { 1: 56670, 2: 57458, 3: 58259, 4: 59073, 5: 59901, 6: 60731, 7: 61568, 8: 62408 },
  21: { 1: 63012, 2: 63900, 3: 64804, 4: 65722, 5: 66655, 6: 67604, 7: 68536, 8: 69515 },
  22: { 1: 70346, 2: 71349, 3: 72370, 4: 73408, 5: 74462, 6: 75498, 7: 76586, 8: 77692 },
  23: { 1: 78584, 2: 79717, 3: 80870, 4: 82047, 5: 83333, 6: 84639, 7: 85966, 8: 87260 },
  24: { 1: 88367, 2: 89749, 3: 91155, 4: 92584, 5: 94035, 6: 95511, 7: 96965, 8: 98488 },
  25: { 1: 100554, 2: 102128, 3: 103729, 4: 105356, 5: 107009, 6: 108689, 7: 110398, 8: 112132 },
  26: { 1: 113627, 2: 115405, 3: 117214, 4: 119052, 5: 120920, 6: 122819, 7: 124747, 8: 126709 },
  27: { 1: 128397, 2: 130407, 3: 132452, 4: 134466, 5: 136577, 6: 138465, 7: 140640, 8: 142851 },
  28: { 1: 144422, 2: 146689, 3: 148993, 4: 151195, 5: 153571, 6: 155988, 7: 158223, 8: 160715 },
  29: { 1: 162443, 2: 164999, 3: 167596, 4: 170236, 5: 172918, 6: 175317, 7: 178083, 8: 180894 },
  30: { 1: 182880, 2: 185761, 3: 188602, 4: 191494, 5: 194420, 6: 197491, 7: 200517, 8: 203687 },
};

/**
 * Find the closest SG and Step match for a given monthly salary
 * Uses percentage-based tolerance to find the best match
 */
export function findSGAndStepFromSalary(monthlySalary: number): { sg: number | null; step: number | null; confidence: number } {
  if (!monthlySalary || monthlySalary < 10000) {
    return { sg: null, step: null, confidence: 0 };
  }

  let bestMatch: { sg: number; step: number; diff: number; confidence: number } | null = null;

  // Search through all SG levels and steps
  for (let sg = 1; sg <= 30; sg++) {
    const sgData = SALARY_GRADE_TABLE[sg];
    if (!sgData) continue;

    for (let step = 1; step <= 8; step++) {
      const tableSalary = sgData[step];
      if (!tableSalary) continue;

      // Calculate percentage difference
      const diff = Math.abs(monthlySalary - tableSalary);
      const percentDiff = (diff / tableSalary) * 100;

      // If within 2% tolerance, it's a potential match
      if (percentDiff <= 2) {
        if (!bestMatch || percentDiff < bestMatch.confidence) {
          bestMatch = { sg, step, diff, confidence: percentDiff };
        }
      }
    }
  }

  if (bestMatch) {
    return {
      sg: bestMatch.sg,
      step: bestMatch.step,
      confidence: Math.round((1 - bestMatch.confidence / 100) * 100),
    };
  }

  return { sg: null, step: null, confidence: 0 };
}

/**
 * Get salary range for a specific SG (min Step 1, max Step 8)
 */
export function getSalaryRangeForSG(sg: number): { min: number; max: number } | null {
  const sgData = SALARY_GRADE_TABLE[sg];
  if (!sgData) return null;
  
  return {
    min: sgData[1],
    max: sgData[8],
  };
}

/**
 * Validate if extracted SG matches the salary
 * Returns confidence score (0-100)
 */
export function validateSGWithSalary(extractedSG: number, monthlySalary: number): { valid: boolean; confidence: number; expectedSG: number | null; expectedStep: number | null } {
  const lookup = findSGAndStepFromSalary(monthlySalary);
  
  if (!lookup.sg || !lookup.step) {
    return { valid: false, confidence: 0, expectedSG: null, expectedStep: null };
  }

  const isValid = extractedSG === lookup.sg;
  
  return {
    valid: isValid,
    confidence: lookup.confidence,
    expectedSG: lookup.sg,
    expectedStep: lookup.step,
  };
}
