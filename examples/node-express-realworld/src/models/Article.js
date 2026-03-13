const mongoose = require('mongoose');
const uniqueValidator = require('mongoose-unique-validator');

const ArticleSchema = new mongoose.Schema({
  slug: { type: String, lowercase: true, unique: true, required: true, match: /^[a-z0-9-]+$/ },
  title: { type: String, required: true },
  description: String,
  body: { type: String, required: true },
  tagList: [{ type: String }],
  favorited: { type: Boolean, default: false },
  favoritesCount: { type: Number, default: 0 },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

ArticleSchema.plugin(uniqueValidator, { message: 'is already taken' });

ArticleSchema.methods.toJSON = function() {
  return {
    slug: this.slug,
    title: this.title,
    description: this.description,
    body: this.body,
    tagList: this.tagList,
    favorited: this.favorited,
    favoritesCount: this.favoritesCount,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

ArticleSchema.pre('validate', function(next) {
  if (!this.slug) {
    this.slug = this.title.toLowerCase().replace(/ /g, '-');
  }
  next();
});

module.exports = mongoose.model('Article', ArticleSchema);
