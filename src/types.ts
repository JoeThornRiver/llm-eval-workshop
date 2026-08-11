/**
 * Domain types, extracted and simplified from the production repo.
 *
 * The production app stores the menu in SQLite and speaks German to
 * customers; this workshop extract loads the menu from a JSON fixture and is
 * English-only. The structural ideas are identical.
 */

export interface OptionGroup {
	/** Dimension name, e.g. "Flavor" or "Milk". Single-select per group. */
	name: string;
	options: { name: string }[];
}

export interface AddOn {
	/** Stackable extra, e.g. "Cream". Zero or more per serving. */
	name: string;
}

export interface MatchingMenuItem {
	name: string;
	price: number;
	/** True for Waffle Cone / Cup — things scoops go INTO. */
	isContainer?: boolean;
	/** True for scoops — they MUST sit in a container. */
	requiresContainer?: boolean;
	optionGroups?: OptionGroup[];
	addOns?: AddOn[];
}

export interface Scoop {
	id: string;
	name: string;
}

export interface ContainerGroup {
	type: 'container';
	id: string;
	container: { name: string };
	scoops: Scoop[];
	addOns?: string[];
}

export interface StandaloneGroup {
	type: 'standalone';
	id: string;
	item: { name: string };
	options?: string[];
	addOns?: string[];
}

export type OrderGroup = ContainerGroup | StandaloneGroup;
