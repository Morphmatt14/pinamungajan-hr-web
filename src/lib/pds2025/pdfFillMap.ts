export type NormBox = { x: number; y: number; w: number; h: number };

export const PDS2025_PAGE1_NORM_MAP: {
  surname: NormBox;
  first_name: NormBox;
  middle_name: NormBox;
  name_extension: NormBox;
  date_of_birth: NormBox;
  place_of_birth: NormBox;
  citizenship: NormBox;
  sex: { male: NormBox; female: NormBox };
} = {
  // Normalized (0..1), TOP-LEFT origin (y from top).
  // Use /api/pds/generate-pdf?debug=1 to visually tune.
  surname: { x: 0.18, y: 0.195, w: 0.24, h: 0.03 },
  first_name: { x: 0.43, y: 0.195, w: 0.22, h: 0.03 },
  middle_name: { x: 0.66, y: 0.195, w: 0.18, h: 0.03 },
  name_extension: { x: 0.85, y: 0.195, w: 0.10, h: 0.03 },

  date_of_birth: { x: 0.18, y: 0.252, w: 0.24, h: 0.03 },
  place_of_birth: { x: 0.43, y: 0.252, w: 0.22, h: 0.03 },
  citizenship: { x: 0.66, y: 0.252, w: 0.29, h: 0.03 },

  sex: {
    male: { x: 0.66, y: 0.308, w: 0.022, h: 0.022 },
    female: { x: 0.73, y: 0.308, w: 0.022, h: 0.022 },
  },
};
