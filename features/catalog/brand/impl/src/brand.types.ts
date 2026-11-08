import { Brand } from './model/brand';

export type BrandData = Omit<Brand, 'id'>;
