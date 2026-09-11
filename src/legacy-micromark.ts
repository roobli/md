/**
 * Legacy micromark + mdast parse backend (Phase 0 compatibility).
 *
 * **Not** loaded by the default `@roobli/md` entry. Import explicitly:
 *
 * ```ts
 * import { splitWithMicromark } from '@roobli/md/legacy-micromark';
 * ```
 *
 * Requires the optional micromark extension packages listed under
 * `optionalDependencies` in package.json. The default parse / reparse /
 * serialize hot path never imports this module.
 */
export { splitWithMicromark } from './backend/micromark-backend.js';
