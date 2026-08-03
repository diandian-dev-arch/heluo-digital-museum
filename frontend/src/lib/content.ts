export interface Category {
  id: number
  code: string
  name: string
  description: string
  sortOrder: number
}

export interface ArtifactCard {
  slug: string
  title: string
  summary: string
  period: string
  material: string
  coverImageUrl: string
  categoryCode: string
  categoryName: string
}

export interface ArticleCard {
  slug: string
  title: string
  summary: string
  coverImageUrl: string
  authorDisplay: string
  categoryCode: string
  categoryName: string
}

export interface ExhibitSummary {
  slug: string
  title: string
  summary: string
  coverImageUrl: string
}

export interface ArtifactDetail extends ArtifactCard {
  id: number
  content: string
  dimensions: string
  collectionLocation: string
  category: { code: string; name: string }
  exhibits: ExhibitSummary[]
}

export interface ArticleDetail extends ArticleCard {
  content: string
  category: { code: string; name: string }
}

export interface SearchResult {
  type: 'artifact' | 'article'
  slug: string
  title: string
  summary: string
  coverImageUrl: string
  categoryName: string
}
