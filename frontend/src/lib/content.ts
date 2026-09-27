import type { BilingualContent } from './contentLocale'

export interface Category {
  id: number
  code: string
  name: string
  description: string
  sortOrder: number
}

export interface ArtifactCard extends BilingualContent {
  slug: string
  title: string
  summary: string
  period: string
  material: string
  coverImageUrl: string
  categoryCode: string
  categoryName: string
}

export interface ArticleCard extends BilingualContent {
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

export interface SearchResult extends BilingualContent {
  type: 'artifact' | 'article'
  slug: string
  title: string
  summary: string
  coverImageUrl: string
  categoryName: string
}
