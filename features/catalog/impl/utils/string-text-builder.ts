export class SearchTextBuilder {
  private tokens: string[] = [];

  add(...values: unknown[]) {
    this.tokens.push(...values.filter(Boolean).map(String));

    return this;
  }

  build() {
    return this.tokens.join(' ');
  }
}
