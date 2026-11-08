import { CustomerAddress } from '@feature/customer-address-api';
import { Customer } from '@feature/customer-api';

export type InterCityRecipient = {
  carrierKey: string;
} & Extract<CustomerAddress, { scope: 'inter_city' }>;

export type IntraCityRecipient = Extract<
  CustomerAddress,
  { scope: 'intra_city' }
>;

export type Recipient = {
  customerContact: Pick<Customer, 'fullName' | 'phoneNumber' | 'type'>;
} & (IntraCityRecipient | InterCityRecipient);
