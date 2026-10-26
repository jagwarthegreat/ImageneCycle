/** Self-check — run: npx tsx src/utils/climbCategoryColor.test.ts */
import { getClimbCategoryColor } from './climbProEngine';

export function runClimbCategoryColorValidation(): void {
  if (getClimbCategoryColor('4') !== '#22c55e') throw new Error('Cat 4 color');
  if (getClimbCategoryColor('3') !== '#eab308') throw new Error('Cat 3 color');
  if (getClimbCategoryColor('2') !== '#f97316') throw new Error('Cat 2 color');
  if (getClimbCategoryColor('1') !== '#ef4444') throw new Error('Cat 1 color');
  if (getClimbCategoryColor('HC') !== '#c026d3') throw new Error('HC color');
  if (getClimbCategoryColor('Uncategorized') !== '#facc15') throw new Error('fallback yellow');
  console.log('climbCategoryColor.test.ts: OK');
}

runClimbCategoryColorValidation();
