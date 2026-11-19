/**
 * The fixed sector list, shared with the server by path (the server build
 * cannot consume runtime code from `shared/`, see lib/dates.ts): the filter
 * offers these ids, the API validates the same ones.
 */
export { SECTORS, isSector, sectorLabel, type Sector } from '../../../server/src/lib/sectors';
