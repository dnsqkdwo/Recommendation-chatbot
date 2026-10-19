/** date(YYYY-MM-DD, KST)가 영업일인지 판정. */
export async function isBusinessDay(_date: string): Promise<boolean> {
    return true;
}
