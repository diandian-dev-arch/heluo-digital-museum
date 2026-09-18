package com.heluo.museum.config;

import java.util.Map;

/** Initial translations for newly created demo records, never applied to existing content. */
final class SeedContentEnglish {
    private SeedContentEnglish() {}
    record Translation(String title, String summary) {}
    private static final Map<String, Translation> VALUES = Map.ofEntries(
            Map.entry("heluo-bronze-ding", new Translation("Heluo Bronze Ding (Digital Reconstruction)", "Explore the form and details of a bronze ding through a digital reconstruction.")),
            Map.entry("water-bird-bronze", new Translation("Water-bird Bronze Sculpture (Concept)", "A water-bird form connects close observation of nature with an imagined ancient object.")),
            Map.entry("heluo-bronze-jue", new Translation("Heluo-pattern Bronze Jue (Concept)", "An original concept object inspired by Heluo patterns, with a light story-led entry into form and motif.")),
            Map.entry("river-map-jade-bi", new Translation("River-map Jade Bi (Concept)", "A jade disc follows the river as a visual thread between ritual, space and memory.")),
            Map.entry("painted-pottery-water-jar", new Translation("Painted Water-pattern Jar (Concept)", "Water patterns and earthen rhythm open a glimpse into prehistoric life along the river.")),
            Map.entry("river-map-pattern-stone", new Translation("River-map Pattern Stone (Concept)", "A concept stone connects Heluo symbols with the memory of place and landscape.")),
            Map.entry("why-negative-space-matters", new Translation("Why does negative space help an exhibit stand out?", "Digital exhibitions need room to breathe between objects, words and the viewer’s gaze.")),
            Map.entry("river-as-timeline", new Translation("Reading the river as a timeline: Heluo culture for a new generation", "Trace the links between water, settlements and motifs so tradition becomes more than a textbook term.")),
            Map.entry("how-to-read-bronze", new Translation("Three questions to ask when viewing bronze for the first time", "Start with form, motifs and use instead of memorizing dates and terminology."))
    );
    static Translation forSlug(String slug) {
        return VALUES.getOrDefault(slug, new Translation(null, null));
    }
}
