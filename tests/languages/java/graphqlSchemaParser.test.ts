import {
  parseGraphqlSchema,
  detectDgsAnnotations,
  isGraphqlSchemaFile,
} from '../../../src/languages/java/graphqlSchemaParser';

describe('parseGraphqlSchema', () => {
  it('extracts Query fields', () => {
    const schema = `
type Query {
  articles(limit: Int, offset: Int): [Article!]!
  article(slug: String!): Article
  tags: [String!]!
}
`;
    const result = parseGraphqlSchema(schema, '/fake/schema.graphqls');
    expect(result.queries).toHaveLength(3);
    expect(result.queries[0].name).toBe('articles');
    expect(result.queries[0].operationType).toBe('query');
    expect(result.queries[0].returnType).toBe('[Article!]!');
    expect(result.queries[0].arguments).toEqual([
      { name: 'limit', type: 'Int' },
      { name: 'offset', type: 'Int' },
    ]);
    expect(result.queries[1].name).toBe('article');
    expect(result.queries[2].name).toBe('tags');
  });

  it('extracts Mutation fields', () => {
    const schema = `
type Mutation {
  createArticle(input: CreateArticleInput!): Article!
  deleteArticle(slug: String!): Boolean!
}
`;
    const result = parseGraphqlSchema(schema, '/fake/schema.graphqls');
    expect(result.mutations).toHaveLength(2);
    expect(result.mutations[0].name).toBe('createArticle');
    expect(result.mutations[0].operationType).toBe('mutation');
    expect(result.mutations[1].name).toBe('deleteArticle');
  });

  it('extracts input types', () => {
    const schema = `
input CreateArticleInput {
  title: String!
  body: String!
  tagList: [String!]
}
`;
    const result = parseGraphqlSchema(schema, '/fake/schema.graphqls');
    expect(result.inputTypes).toHaveLength(1);
    expect(result.inputTypes[0].name).toBe('CreateArticleInput');
    expect(result.inputTypes[0].fields).toEqual([
      { name: 'title', type: 'String!' },
      { name: 'body', type: 'String!' },
      { name: 'tagList', type: '[String!]' },
    ]);
  });

  it('handles extend type Query', () => {
    const schema = `
extend type Query {
  profile(username: String!): Profile
}
`;
    const result = parseGraphqlSchema(schema, '/fake/schema.graphqls');
    expect(result.queries).toHaveLength(1);
    expect(result.queries[0].name).toBe('profile');
  });

  it('handles schema with both queries and mutations', () => {
    const schema = `
type Query {
  articles: [Article!]!
}

type Mutation {
  createArticle(input: CreateArticleInput!): Article!
}

input CreateArticleInput {
  title: String!
}
`;
    const result = parseGraphqlSchema(schema, '/fake/schema.graphqls');
    expect(result.queries).toHaveLength(1);
    expect(result.mutations).toHaveLength(1);
    expect(result.inputTypes).toHaveLength(1);
  });

  it('ignores comments in schema', () => {
    const schema = `
type Query {
  # List all articles
  articles: [Article!]!
}
`;
    const result = parseGraphqlSchema(schema, '/fake/schema.graphqls');
    expect(result.queries).toHaveLength(1);
  });

  it('returns empty for no operations', () => {
    const schema = `
type Article {
  id: ID!
  title: String!
}
`;
    const result = parseGraphqlSchema(schema, '/fake/schema.graphqls');
    expect(result.queries).toHaveLength(0);
    expect(result.mutations).toHaveLength(0);
  });
});

describe('detectDgsAnnotations', () => {
  it('detects @DgsQuery annotation', () => {
    const source = `
@DgsComponent
public class ArticleDataFetcher {
    @DgsQuery
    public List<Article> articles() {
        return articleService.findAll();
    }
}
`;
    const fetchers = detectDgsAnnotations(source, '/fake/ArticleDataFetcher.java');
    expect(fetchers).toHaveLength(1);
    expect(fetchers[0].annotation).toBe('@DgsQuery');
    expect(fetchers[0].parentType).toBe('Query');
    expect(fetchers[0].fieldName).toBe('articles');
  });

  it('detects @DgsQuery with explicit field name', () => {
    const source = `
@DgsQuery(field = "allArticles")
public List<Article> getArticles() {
    return articleService.findAll();
}
`;
    const fetchers = detectDgsAnnotations(source, '/fake/Fetcher.java');
    expect(fetchers).toHaveLength(1);
    expect(fetchers[0].fieldName).toBe('allArticles');
  });

  it('detects @DgsMutation annotation', () => {
    const source = `
@DgsMutation
public Article createArticle(DgsDataFetchingEnvironment dfe) {
    return articleService.create(input);
}
`;
    const fetchers = detectDgsAnnotations(source, '/fake/Fetcher.java');
    expect(fetchers).toHaveLength(1);
    expect(fetchers[0].annotation).toBe('@DgsMutation');
    expect(fetchers[0].parentType).toBe('Mutation');
    expect(fetchers[0].fieldName).toBe('createArticle');
  });

  it('detects @DgsData annotation with parentType', () => {
    const source = `
@DgsData(parentType = "Article", field = "author")
public User getAuthor(DgsDataFetchingEnvironment dfe) {
    return userService.findById(article.getAuthorId());
}
`;
    const fetchers = detectDgsAnnotations(source, '/fake/Fetcher.java');
    expect(fetchers).toHaveLength(1);
    expect(fetchers[0].annotation).toBe('@DgsData');
    expect(fetchers[0].parentType).toBe('Article');
    expect(fetchers[0].fieldName).toBe('author');
  });

  it('detects multiple DGS annotations in one file', () => {
    const source = `
@DgsComponent
public class ArticleFetcher {
    @DgsQuery
    public List<Article> articles() { return null; }

    @DgsMutation
    public Article createArticle() { return null; }

    @DgsData(parentType = "Article", field = "author")
    public User author() { return null; }
}
`;
    const fetchers = detectDgsAnnotations(source, '/fake/Fetcher.java');
    expect(fetchers).toHaveLength(3);
  });

  it('returns empty for non-DGS code', () => {
    const source = `
@RestController
public class ArticleController {
    @GetMapping("/articles")
    public List<Article> list() { return null; }
}
`;
    expect(detectDgsAnnotations(source, '/fake/Controller.java')).toEqual([]);
  });
});

describe('isGraphqlSchemaFile', () => {
  it('returns true for .graphqls files', () => {
    expect(isGraphqlSchemaFile('/fake/schema.graphqls')).toBe(true);
  });

  it('returns true for .graphql files', () => {
    expect(isGraphqlSchemaFile('/fake/schema.graphql')).toBe(true);
  });

  it('returns false for .java files', () => {
    expect(isGraphqlSchemaFile('/fake/Controller.java')).toBe(false);
  });
});
