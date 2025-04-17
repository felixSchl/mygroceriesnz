#
# Script to corelate categories between retailers using ML.
#

from typing import List, Dict, Tuple
import json
from pathlib import Path
import numpy as np


def extract_category_paths(
    data: List[dict], current_path: str = ""
) -> List[Tuple[str, str, str]]:
    """
    Extract all category paths from the tree structure.
    Returns list of tuples: (id, full_path, category_name)
    """
    paths = []

    for item in data:
        # Create the full path
        name = item["name"]
        item_id = item["id"]
        new_path = f"{current_path}/{name}" if current_path else name

        # Add this category
        paths.append((item_id, new_path, name))

        # Recursively process children
        if item.get("children"):
            paths.extend(extract_category_paths(item["children"], new_path))

    return paths


def create_category_embeddings(
    categories: List[Tuple[str, str, str]], embedding_model
) -> Dict[str, List[float]]:
    """
    Create embeddings for each category path
    Returns dict mapping category IDs to their embeddings
    """
    embeddings = {}

    for cat_id, full_path, name in categories:
        # Create embedding for both the full path and the category name alone
        path_embedding = embedding_model.encode(full_path)
        name_embedding = embedding_model.encode(name)

        # Store both embeddings (you might want to weight them differently)
        embeddings[cat_id] = {
            "path_embedding": path_embedding,
            "name_embedding": name_embedding,
            "full_path": full_path,
            "name": name,
        }

    return embeddings


def find_best_match(
    query: str, embeddings: Dict, embedding_model, top_k: int = 5
) -> List[Tuple[str, float, str]]:
    """
    Find the best matching categories for a given query
    Returns list of (category_id, similarity_score, full_path)
    """
    # Create embedding for query
    query_embedding = embedding_model.encode(query)

    # Calculate similarities
    similarities = []
    for cat_id, data in embeddings.items():
        # Calculate similarity with both path and name embeddings
        path_similarity = cosine_similarity(query_embedding, data["path_embedding"])
        name_similarity = cosine_similarity(query_embedding, data["name_embedding"])

        # Combine similarities (you can adjust weights)
        combined_similarity = 0.7 * name_similarity + 0.3 * path_similarity

        similarities.append((cat_id, combined_similarity, data["full_path"]))

    # Sort by similarity and return top k
    return sorted(similarities, key=lambda x: x[1], reverse=True)[:top_k]


def save_embeddings(embeddings: Dict, file_path: str):
    """Save embeddings to disk"""
    # Convert numpy arrays to lists for JSON serialization
    serializable_embeddings = {}
    for cat_id, data in embeddings.items():
        serializable_embeddings[cat_id] = {
            "path_embedding": data["path_embedding"].tolist(),
            "name_embedding": data["name_embedding"].tolist(),
            "full_path": data["full_path"],
            "name": data["name"],
        }

    with open(file_path, "w") as f:
        json.dump(serializable_embeddings, f)


def load_embeddings(file_path: str) -> Dict:
    """Load embeddings from disk"""
    with open(file_path, "r") as f:
        data = json.load(f)

    # Convert lists back to numpy arrays
    embeddings = {}
    for cat_id, item in data.items():
        embeddings[cat_id] = {
            "path_embedding": np.array(item["path_embedding"]),
            "name_embedding": np.array(item["name_embedding"]),
            "full_path": item["full_path"],
            "name": item["name"],
        }
    return embeddings


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    """
    Calculate cosine similarity between two vectors
    """
    return np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b))


def process_source_categories(source_file: str, embeddings: Dict, model) -> dict:
    """
    Process each category in the source file and find best matches in target categories
    Returns a dictionary with the mapping structure
    """
    with open(source_file) as f:
        source_tree = json.load(f)

    # Extract all source categories
    source_categories = extract_category_paths(source_tree)

    # Create connections array
    connections = []

    for source_id, source_path, source_name in source_categories:
        # Get best match
        matches = find_best_match(source_path, embeddings, model, top_k=1)
        if matches:
            # Take only the best match
            target_id, score, _ = matches[0]

            # Only include matches above certain confidence threshold
            if score > 0.5:  # You can adjust this threshold
                connections.append({"sourceId": source_path, "targetId": target_id})

    return {"connections": connections}


# Update the main execution code
if __name__ == "__main__":
    import sys

    if len(sys.argv) != 2:
        print("Usage: python cats.py <source_categories.json>")
        sys.exit(1)

    source_file = sys.argv[1]

    print("Loading target categories...")
    with open(f"./scripts/cats/target.json") as f:
        category_tree = json.load(f)

    print("Extracting target category paths...")
    category_paths = extract_category_paths(category_tree)

    print("Loading model...")
    from sentence_transformers import SentenceTransformer

    model = SentenceTransformer("all-MiniLM-L6-v2")

    # Handle embeddings caching
    embeddings_file = "category_embeddings.json"
    if Path(embeddings_file).exists():
        print("Loading cached embeddings...")
        embeddings = load_embeddings(embeddings_file)
    else:
        print("Creating embeddings...")
        embeddings = create_category_embeddings(category_paths, model)
        print("Saving embeddings...")
        save_embeddings(embeddings, embeddings_file)

    # Process source categories and get mapping
    print(f"Mapping categories...")
    mapping = process_source_categories(source_file, embeddings, model)

    # Save mapping to file
    output_file = "category_mapping.json"
    with open(output_file, "w") as f:
        json.dump(mapping, f, indent=2)

    print(f"\nMapping saved to {output_file}")
