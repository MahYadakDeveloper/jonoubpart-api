export interface CategoryDeletionRequest {
  categoryId: string;
}

export interface CategoryUpdateRequest {
  categoryId: string;
  update: {
    name: string;
  };
}
