import {
  parseMyBatisMapper,
  isMyBatisMapperXml,
  type MyBatisQuery,
} from '../../../src/languages/java/mybatisXmlParser';

describe('parseMyBatisMapper', () => {
  it('parses namespace from mapper element', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8" ?>
<mapper namespace="com.example.mapper.ArticleMapper">
  <select id="findById" resultType="Article">
    SELECT * FROM articles WHERE id = #{id}
  </select>
</mapper>`;
    const result = parseMyBatisMapper(xml, '/fake/ArticleMapper.xml');
    expect(result).not.toBeNull();
    expect(result!.namespace).toBe('com.example.mapper.ArticleMapper');
  });

  it('extracts select, insert, update, delete queries', () => {
    const xml = `<mapper namespace="com.example.ArticleMapper">
  <select id="findAll" resultType="Article">SELECT * FROM articles</select>
  <select id="findById" resultType="Article">SELECT * FROM articles WHERE id = #{id}</select>
  <insert id="create" parameterType="Article">INSERT INTO articles (title) VALUES (#{title})</insert>
  <update id="update" parameterType="Article">UPDATE articles SET title = #{title} WHERE id = #{id}</update>
  <delete id="deleteById">DELETE FROM articles WHERE id = #{id}</delete>
</mapper>`;
    const result = parseMyBatisMapper(xml, '/fake/mapper.xml');
    expect(result!.queries).toHaveLength(5);
    expect(result!.queries.map((q: MyBatisQuery) => q.type)).toEqual(['select', 'select', 'insert', 'update', 'delete']);
    expect(result!.queries.map((q: MyBatisQuery) => q.id)).toEqual(['findAll', 'findById', 'create', 'update', 'deleteById']);
  });

  it('detects conditional branches (<if>, <choose>, <foreach>)', () => {
    const xml = `<mapper namespace="com.example.ArticleMapper">
  <select id="findByFilter" resultType="Article">
    SELECT * FROM articles WHERE 1=1
    <if test="title != null">AND title = #{title}</if>
    <if test="category != null">AND category = #{category}</if>
    <choose>
      <when test="sort == 'date'">ORDER BY created_at DESC</when>
      <otherwise>ORDER BY id DESC</otherwise>
    </choose>
  </select>
</mapper>`;
    const result = parseMyBatisMapper(xml, '/fake/mapper.xml');
    expect(result!.queries).toHaveLength(1);
    expect(result!.queries[0].hasConditionals).toBe(true);
    expect(result!.queries[0].conditionalCount).toBe(3); // 2 <if> + 1 <choose>
  });

  it('extracts resultMap with associations and collections', () => {
    const xml = `<mapper namespace="com.example.ArticleMapper">
  <resultMap id="articleResult" type="com.example.Article">
    <id property="id" column="id"/>
    <result property="title" column="title"/>
    <association property="author" javaType="com.example.User" columnPrefix="author_"/>
    <collection property="tags" ofType="com.example.Tag">
      <id property="id" column="tag_id"/>
    </collection>
  </resultMap>
  <select id="findAll" resultMap="articleResult">SELECT * FROM articles</select>
</mapper>`;
    const result = parseMyBatisMapper(xml, '/fake/mapper.xml');
    expect(result!.resultMaps).toHaveLength(1);
    expect(result!.resultMaps[0].id).toBe('articleResult');
    expect(result!.resultMaps[0].type).toBe('com.example.Article');
    expect(result!.resultMaps[0].associations).toEqual(['com.example.User']);
    expect(result!.resultMaps[0].collections).toEqual(['com.example.Tag']);
  });

  it('returns null for non-mapper XML', () => {
    const xml = `<?xml version="1.0"?><config><setting name="debug" value="true"/></config>`;
    expect(parseMyBatisMapper(xml, '/fake/config.xml')).toBeNull();
  });

  it('extracts parameterType from queries', () => {
    const xml = `<mapper namespace="com.example.Mapper">
  <insert id="create" parameterType="com.example.Article">INSERT INTO articles</insert>
</mapper>`;
    const result = parseMyBatisMapper(xml, '/fake/mapper.xml');
    expect(result!.queries[0].parameterType).toBe('com.example.Article');
  });
});

describe('isMyBatisMapperXml', () => {
  it('returns true for valid MyBatis mapper XML', () => {
    const xml = `<mapper namespace="com.example.Mapper"><select id="find">SELECT 1</select></mapper>`;
    expect(isMyBatisMapperXml(xml)).toBe(true);
  });

  it('returns false for non-mapper XML', () => {
    expect(isMyBatisMapperXml('<config></config>')).toBe(false);
  });

  it('returns false for mapper without queries', () => {
    expect(isMyBatisMapperXml('<mapper namespace="x"></mapper>')).toBe(false);
  });
});
