import { paginate, PaginationQuery } from './pagination.js';

const query = (page: number, pageSize: number): PaginationQuery =>
  Object.assign(new PaginationQuery(), { page, pageSize });

describe('pagination', () => {
  it('derives skip/take from the page and size', () => {
    const q = query(3, 20);
    expect(q.skip).toBe(40);
    expect(q.take).toBe(20);
  });

  it('starts the first page at offset zero', () => {
    expect(query(1, 20).skip).toBe(0);
  });

  it('reports the total page count, rounding up a partial page', () => {
    const result = paginate(['a'], 41, query(1, 20));
    expect(result.meta.totalPages).toBe(3);
  });

  it('reports one page when there are no items, not zero', () => {
    // A zero page count reads as "no valid page exists" to a client that
    // paginates by counting; an empty first page is the truthful answer.
    const result = paginate([], 0, query(1, 20));
    expect(result.meta.totalPages).toBe(1);
    expect(result.data).toEqual([]);
  });

  it('carries the query values through into the response metadata', () => {
    const result = paginate(['a', 'b'], 2, query(1, 50));
    expect(result.meta).toEqual({
      page: 1,
      pageSize: 50,
      totalItems: 2,
      totalPages: 1,
    });
  });
});
