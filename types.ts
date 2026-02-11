
export interface Recipe {
  name: string;
  prep_time: number;
  difficulty: string;
  ingredients: string[];
  steps: string[];
  imageUrl?: string;
}

export interface CulinaryResponse {
  detected_ingredients: string[];
  recipes: Recipe[];
  tip: string;
}

export type Tab = 'scan' | 'recipes' | 'settings';
